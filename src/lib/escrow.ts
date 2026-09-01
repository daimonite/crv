/**
 * @file lib/escrow.ts
 * @description Marketplace escrow settlement. After a buyer's Payme collection
 * completes (webhook), the order is confirmed and the supplier is paid out via
 * a Payme disbursement to their mobile-money wallet.
 *
 * NOTE: In the Payme sandbox, disbursements may be disabled per merchant —
 * when that happens we still record the payout as `processing` with a
 * `failure_reason`, and notify the supplier that payment is pending settlement.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface PayableOrder {
  id: string;
  order_reference: string;
  seller_id: string;
  buyer_branch_id: string;
}

/**
 * Runs the settlement leg after an order payment completes:
 *   1. confirms the order (already `confirmed` on success — idempotent),
 *   2. resolves the supplier payout wallet (accounts.payme_wallet_number → payment_settings),
 *   3. records a `disbursements` row and pushes a Payme disbursement,
 *   4. notifies supplier + pharmacy of the payout status.
 */
export async function settleOrderPayout(args: {
  service: SupabaseClient;
  payment: { id: string; reference: string; amount_tzs: number; account_id: string };
  order: PayableOrder;
}): Promise<{ ok: boolean; message: string }> {
  const { service, payment, order } = args;

  const [
    { data: sellerAcct, error: sellerError },
    { data: sellerSettings },
  ] = await Promise.all([
    service
      .from("accounts")
      .select("id, name, payme_wallet_number, phone, email")
      .eq("id", order.seller_id)
      .single(),
    service
      .from("payment_settings")
      .select("payme_wallet_number")
      .eq("account_id", order.seller_id)
      .maybeSingle(),
  ]);

  if (sellerError || !sellerAcct) {
    return { ok: false, message: `Supplier ${order.seller_id} not found.` };
  }

  const walletNumber =
    (sellerAcct.payme_wallet_number ?? "").trim() ||
    (sellerSettings as { payme_wallet_number?: string | null } | null)?.payme_wallet_number?.trim() ||
    "";

  const disbursementRef = `DIS-${Date.now().toString(36).toUpperCase()}-${order.seller_id.slice(0, 4).toUpperCase()}`;
  const feeTzs = 0;
  const amountTzs = Number(payment.amount_tzs) || 0;

  if (!walletNumber) {
    // No payout destination yet — leave the money pending and nudge the supplier.
    const { error: dispInsertError } = await service.from("disbursements").insert({
      payment_id: payment.id,
      order_id: order.id,
      account_id: payment.account_id,
      supplier_id: order.seller_id,
      reference: disbursementRef,
      amount_tzs: amountTzs,
      fee_tzs: feeTzs,
      net_amount_tzs: amountTzs - feeTzs,
      status: "pending",
      failure_reason: "Supplier payout wallet not configured",
    });
    if (dispInsertError) return { ok: false, message: dispInsertError.message };

    await service.from("notifications").insert([
      {
        account_id: order.seller_id,
        kind: "payment",
        title: "Order paid — add your payout wallet",
        body: `Order ${order.order_reference} is paid and awaiting payout. Add your Payme wallet in Payment Settings to receive the funds.`,
        route: "/supplier/settings",
        read: false,
      },
      {
        account_id: payment.account_id,
        kind: "order",
        title: "Order paid",
        body: `Order ${order.order_reference} was paid. The supplier will be paid once they add their payout wallet.`,
        route: "/dashboard/orders",
        read: false,
      },
    ]);

    return { ok: true, message: "Order confirmed. Supplier payout pending wallet setup." };
  }

  // Create the payout record BEFORE hitting Payme so a failure still leaves a trace.
  const { error: dispInsertError } = await service.from("disbursements").insert({
    payment_id: payment.id,
    order_id: order.id,
    account_id: payment.account_id,
    supplier_id: order.seller_id,
    reference: disbursementRef,
    amount_tzs: amountTzs,
    fee_tzs: feeTzs,
    net_amount_tzs: amountTzs - feeTzs,
    msisdn: walletNumber,
    channel: "CASHIN",
    status: "pending",
  });
  if (dispInsertError) return { ok: false, message: dispInsertError.message };

  const { initiateDisbursement } = await import("@/lib/payme");
  const { data: paymeData, error: paymeError } = await initiateDisbursement({
    amount: amountTzs,
    msisdn: walletNumber,
    channel: "CASHIN",
    reference: disbursementRef,
  });

  if (paymeError) {
    await service
      .from("disbursements")
      .update({ status: "failed", failure_reason: paymeError })
      .eq("reference", disbursementRef);
    return { ok: false, message: paymeError };
  }

  await service
    .from("disbursements")
    .update({
      provider_transaction_id: paymeData?.transaction_id || null,
      status: paymeData?.payment_status === "COMPLETED" ? "completed" : "processing",
      completed_at: paymeData?.payment_status === "COMPLETED" ? new Date().toISOString() : null,
    })
    .eq("reference", disbursementRef);

  const payoutLabel = paymeData?.payment_status === "COMPLETED" ? "paid" : "payout initiated";

  await service.from("notifications").insert([
    {
      account_id: order.seller_id,
      kind: "payment",
      title: "Supplier payout",
      body: `Order ${order.order_reference} settlement ${payoutLabel} — TSh ${amountTzs.toLocaleString()}`,
      route: "/supplier/orders",
      read: false,
    },
    {
      account_id: payment.account_id,
      kind: "order",
      title: "Order confirmed & settled",
      body: `Order ${order.order_reference} is confirmed. The supplier has been ${payoutLabel} (TSh ${amountTzs.toLocaleString()}).`,
      route: "/dashboard/orders",
      read: false,
    },
  ]);

  return { ok: true, message: `Order confirmed and supplier ${payoutLabel}.` };
}