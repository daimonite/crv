/**
 * @route POST /api/subscription/subscribe-branch
 * @description Starts a POS subscription payment for a single branch — the
 * desktop app's plan, priced by that branch's stock value, distinct from the
 * pharmacy portal's account-level (network-size) subscription_plans. Body:
 * { branchId, planId, msisdn?, months? }. Called by the desktop app with a
 * Bearer token (see lib/api-auth.ts), not a cookie session.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getBranchPlans, createBranchSubscriptionCheckout } from "@/lib/subscription";

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { branchId?: string; planId?: string; msisdn?: string; months?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.branchId) return NextResponse.json({ error: "branchId is required" }, { status: 400 });
  if (!body.planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  const service = await createServiceClient();

  const { data: account } = await service.from("accounts").select("id").eq("auth_user_id", user.id).single();
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const { data: branch } = await service.from("branches").select("id, account_id").eq("id", body.branchId).single();
  if (!branch || branch.account_id !== account.id) {
    return NextResponse.json({ error: "Branch not found or access denied." }, { status: 403 });
  }

  const { data: plans, error: plansError } = await getBranchPlans(service, body.planId);
  if (plansError) return NextResponse.json({ error: plansError }, { status: 500 });
  const plan = plans?.[0];
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  const result = await createBranchSubscriptionCheckout({
    service,
    branchId: body.branchId,
    plan,
    months: body.months ?? 1,
    msisdn: body.msisdn,
  });

  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ reference: result.reference, message: result.message });
}
