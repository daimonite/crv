/**
 * @route POST /api/marketplace/pay-order
 * @description Pays for an existing marketplace order (status `pending`) using
 * the Payme mobile-money collection. Used by the pharmacy order detail and the
 * branch operator portal. On webhook completion the order is confirmed and the
 * supplier is paid out (see /api/webhooks/payme + lib/escrow.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { orderId?: string; msisdn?: string; idempotencyKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const service = await createServiceClient();

  const { data: account } = await service
    .from("accounts")
    .select("id, type, subscription_status, subscription_expires_at")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const { data: order } = await service
    .from("orders")
    .select("id, order_reference, seller_id, buyer_branch_id, status, currency")
    .eq("id", orderId)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status === "pending") {
    return NextResponse.json(
      { error: "This order is still awaiting supplier approval. You can pay once the supplier approves it.", code: "AWAITING_APPROVAL" },
      { status: 409 }
    );
  }
  if (order.status !== "approved") {
    return NextResponse.json({ error: "This order can only be paid while it's approved and unpaid." }, { status: 409 });
  }

  // Authorization: the buyer branch must belong to the calling account.
  const { data: branch } = await service
    .from("branches")
    .select("id, account_id, name")
    .eq("id", order.buyer_branch_id)
    .single();

  if (!branch || branch.account_id !== account.id) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // Idempotency guard — don't double-charge an order that's already paid.
  const { data: existingPayment } = await service
    .from("payments")
    .select("id, reference, status")
    .eq("order_id", orderId)
    .in("status", ["pending", "processing", "completed"])
    .maybeSingle();

  if (existingPayment) {
    const done = existingPayment.status === "completed";
    return NextResponse.json({
      orderId,
      reference: existingPayment.reference,
      total: 0,
      payment: {
        status: existingPayment.status,
        reference: existingPayment.reference,
        message: done ? "Order already paid." : "A payment for this order is already in progress.",
      },
      alreadyPaid: done,
    });
  }

  // Total from line items (server-side, never client-supplied).
  const { data: lineItems, error: lineItemsError } = await service
    .from("order_line_items")
    .select("quantity, unit_price")
    .eq("order_id", orderId);

  if (lineItemsError) return NextResponse.json({ error: lineItemsError.message }, { status: 500 });

  const total = (lineItems ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  if (total <= 0) {
    return NextResponse.json({ error: "Order has no payable total." }, { status: 400 });
  }

  const walletMsisdn = (body.msisdn ?? "").trim();
  if (!walletMsisdn) {
    return NextResponse.json({ error: "A mobile-money wallet number is required to pay." }, { status: 400 });
  }

  const reference = `PAY-${order.order_reference}-${orderId.slice(0, 8)}`;
  const idempotencyKey = body.idempotencyKey || `${orderId}-${Date.now()}`;

  const { error: payInsertError } = await service.from("payments").insert({
    account_id: account.id,
    order_id: orderId,
    reference,
    idempotency_key: idempotencyKey,
    amount_tzs: total,
    msisdn: walletMsisdn,
    status: "pending",
  });

  if (payInsertError) {
    // Unique reference already exists → a payment for this order exists.
    return NextResponse.json({ error: payInsertError.message, alreadyPaid: /reference|duplicate|uq/i.test(payInsertError.message) }, { status: 409 });
  }

  const { initiateCollection } = await import("@/lib/payme");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data: paymeData, error: paymeError } = await initiateCollection({
    amount: total,
    msisdn: walletMsisdn,
    reference,
    callback_url: `${appUrl}/api/webhooks/payme`,
  });

  if (paymeError) {
    await service.from("payments").update({ status: "failed", failure_reason: paymeError }).eq("reference", reference);
    return NextResponse.json({ orderId, reference, total, payment: { status: "failed", reference, error: paymeError } }, { status: 502 });
  }

  await service.from("payments").update({
    provider_transaction_id: paymeData?.transaction_id || null,
    status: paymeData?.payment_status === "COMPLETED" ? "completed" : "pending",
    completed_at: paymeData?.payment_status === "COMPLETED" ? new Date().toISOString() : null,
  }).eq("reference", reference);

  return NextResponse.json({
    orderId,
    reference,
    total,
    payment: {
      status: paymeData?.payment_status === "COMPLETED" ? "completed" : "pending",
      reference,
      transaction_id: paymeData?.transaction_id ?? null,
      message:
        paymeData?.payment_status === "COMPLETED"
          ? "Payment completed — order confirmed."
          : "Payment initiated — confirm the mobile money prompt to confirm the order.",
    },
  });
}