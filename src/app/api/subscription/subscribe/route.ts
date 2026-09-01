/**
 * @route POST /api/subscription/subscribe
 * @description Starts a subscription payment for the signed-in account
 * (pharmacy or supplier). Body: { planId, audience, msisdn?, months? }.
 * Returns `{ reference, message }` — the actual activation happens async via
 * the Payme webhook (reference SUB-…), or immediately in sandbox responses
 * where Payme reports COMPLETED synchronously.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlans, createSubscriptionCheckout } from "@/lib/subscription";
import { savePaymentSettingsWallet } from "@/lib/subscription";

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { planId?: string; audience?: "pharmacy" | "supplier"; msisdn?: string; months?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const audience = body.audience === "supplier" ? "supplier" : "pharmacy";
  if (!body.planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const service = await createServiceClient();

  const { data: account } = await service
    .from("accounts")
    .select("id, type, name")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.type !== audience) {
    return NextResponse.json({ error: "Plan audience doesn't match your account type." }, { status: 403 });
  }

  const { data: plans, error: plansError } = await getPlans(service, audience, body.planId);
  if (plansError) return NextResponse.json({ error: plansError }, { status: 500 });

  const plan = plans?.[0];
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  const wallet = (body.msisdn ?? "").trim();
  // Persist the paying wallet so future renewals / settlements target it.
  if (wallet) await savePaymentSettingsWallet(account.id, wallet);

  const result = await createSubscriptionCheckout({
    service,
    accountId: account.id,
    plan,
    months: body.months ?? 1,
    msisdn: wallet,
  });

  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ reference: result.reference, message: result.message });
}