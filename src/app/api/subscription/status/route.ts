/**
 * @route GET /api/subscription/status
 * @description Subscription + connection-limit overview for the signed-in
 * account. Used by the billing/profile pages of both portals and by the
 * supplier subscription page to show live connected-pharmacy usage.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlans, isSubscribedActive, SubscriptionPlan } from "@/lib/subscription";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = await createServiceClient();

  const { data: account } = await service
    .from("accounts")
    .select("id, type, name, subscription_status, subscription_plan, subscription_expires_at, subscription_started_at, trial_ends_at, verified")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const audience = account.type === "supplier" ? "supplier" : "pharmacy";

  const now = Date.now();
  const subscribed =
    isSubscribedActive(account) ||
    (account.trial_ends_at && new Date(account.trial_ends_at).getTime() > now);

  // Resolve the stored plan id → plan row; PAYG (no plan) → cheapest of the audience.
  const { data: plans, error: plansError } = await getPlans(service, audience);
  if (plansError) return NextResponse.json({ error: plansError }, { status: 500 });

  let plan: SubscriptionPlan | null = null;
  if (plans) {
    plan = plans.find((p) => p.id === account.subscription_plan || p.name === account.subscription_plan) ?? null;
    if (!plan) plan = plans[0] ?? null;
  }

  let usage = { connected: 0, branches: 0, operators: 0 };
  try {
    if (audience === "supplier") {
      const { count } = await service
        .from("branch_supplier_connections")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", account.id)
        .eq("status", "approved");
      usage.connected = count ?? 0;
    } else {
      const { data: branches } = await service
        .from("branches")
        .select("id")
        .eq("account_id", account.id);
      usage.branches = branches?.length ?? 0;
      const { count } = await service
        .from("branch_supplier_connections")
        .select("id", { count: "exact", head: true })
        .in("branch_id", (branches ?? []).map((b) => b.id))
        .eq("status", "approved");
      usage.connected = count ?? 0;
    }
  } catch {
    // usage is best-effort; don't fail the whole status request
  }

  return NextResponse.json({
    account,
    subscribed,
    audience,
    plan,
    payg: !account.subscription_plan,
    limits: {
      maxConnected: plan?.max_connected_pharmacies ?? 0,
      maxSuppliers: plan?.max_suppliers ?? 0,
      maxBranches: plan?.max_branches ?? 0,
      maxOperators: plan?.max_operators ?? 0,
    },
    usage,
    plans,
  });
}