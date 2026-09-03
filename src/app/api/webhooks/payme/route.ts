/**
 * @route POST /api/webhooks/payme
 * @description Payme Africa webhook endpoint. Receives payment status updates.
 *
 * Verifies the webhook signature using HMAC-SHA256, then updates the payment
 * record in the database. Idempotent — duplicate webhooks are safely ignored.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature, type PaymeWebhookPayload } from "@/lib/payme";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { activateSubscription, activateBranchSubscription } from "@/lib/subscription";
import { settleOrderPayout } from "@/lib/escrow";

export async function POST(req: NextRequest) {
  const rl = checkRateLimit("payme-webhook", 100, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const rawBody = await req.text();
  // Per Payme Africa's integration guide, webhook callbacks carry the
  // signature in X-Middleware-Signature (distinct from the X-Signature
  // header *we* send on outbound requests in src/lib/payme.ts).
  const signature = req.headers.get("X-Middleware-Signature") || "";
  const timestamp = req.headers.get("X-Timestamp") || "";

  if (!verifyWebhookSignature(rawBody, timestamp, signature)) {
    console.error("[Payme Webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PaymeWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reference, result, payment_status, transid, amount, msisdn } = payload;

  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, reference, status, account_id, order_id, amount_tzs")
    .eq("reference", reference)
    .single();

  if (fetchError || !payment) {
    console.error(`[Payme Webhook] Payment not found for reference: ${reference}`);
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status === "completed" || payment.status === "refunded") {
    return NextResponse.json({ ok: true, message: "Already processed" });
  }

  const succeeded = payment_status === "COMPLETED" && result === "SUCCESS";

  const updateFields: Record<string, unknown> = {
    provider_transaction_id: transid,
    updated_at: new Date().toISOString(),
  };

  if (succeeded) {
    updateFields.status = "completed";
    updateFields.completed_at = new Date().toISOString();

    if (payment.order_id) {
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "confirmed" })
        .eq("id", payment.order_id)
        .eq("status", "approved");

      if (orderError) {
        console.error(`[Payme Webhook] Failed to update order: ${orderError.message}`);
      }
    }
  } else if (payment_status === "FAILED" || result === "FAILED") {
    updateFields.status = "failed";
    updateFields.failed_at = new Date().toISOString();
    updateFields.failure_reason = payload.result || "Payment failed";
  }

  const { error: updateError } = await supabase
    .from("payments")
    .update(updateFields)
    .eq("id", payment.id);

  if (updateError) {
    console.error(`[Payme Webhook] Failed to update payment: ${updateError.message}`);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }

  if (succeeded) {
    if (reference.startsWith("SUB-")) {
      const sub = await activateSubscription({ service: supabase, reference });
      if (!sub.ok) {
        console.error(`[Payme Webhook] Subscription activation failed for ${reference}: ${sub.message}`);
      }
    } else if (reference.startsWith("BRSUB-")) {
      const sub = await activateBranchSubscription({ service: supabase, reference });
      if (!sub.ok) {
        console.error(`[Payme Webhook] Branch subscription activation failed for ${reference}: ${sub.message}`);
      }
    } else if (payment.order_id) {
      // Escrow settlement: confirm order + disburse to supplier.
      const orderRes = await supabase
        .from("orders")
        .select("id, order_reference, seller_id, buyer_branch_id")
        .eq("id", payment.order_id)
        .single();

      if (orderRes.data) {
        const settle = await settleOrderPayout({ service: supabase, payment, order: orderRes.data });
        if (!settle.ok) {
          console.error(`[Payme Webhook] Settlement failed for order ${payment.order_id}: ${settle.message}`);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
