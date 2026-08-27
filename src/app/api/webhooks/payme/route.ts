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

export async function POST(req: NextRequest) {
  const rl = checkRateLimit("payme-webhook", 100, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const rawBody = await req.text();
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
    .select("id, status, account_id, order_id, amount_tzs")
    .eq("reference", reference)
    .single();

  if (fetchError || !payment) {
    console.error(`[Payme Webhook] Payment not found for reference: ${reference}`);
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status === "completed" || payment.status === "refunded") {
    return NextResponse.json({ ok: true, message: "Already processed" });
  }

  const updateFields: Record<string, unknown> = {
    provider_transaction_id: transid,
    updated_at: new Date().toISOString(),
  };

  if (payment_status === "COMPLETED" && result === "SUCCESS") {
    updateFields.status = "completed";
    updateFields.completed_at = new Date().toISOString();

    if (payment.order_id) {
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "confirmed" })
        .eq("id", payment.order_id)
        .eq("status", "pending");

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

  return NextResponse.json({ ok: true });
}
