/**
 * @route /dashboard/billing
 * @access Authenticated pharmacy accounts only.
 * @description Self-service billing page for pharmacy users: subscription
 * status + expiry, connected-supplier usage, mobile-money "Pay now" to activate
 * a 30-day subscription, and plan switching.
 */
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlans, isSubscribedActive } from "@/lib/subscription";
import { selectPlan } from "@/lib/actions/pharmacy";
import PharmacySidebar from "@/components/PharmacySidebar";
import PlanPayButton from "@/components/PlanPayButton";
import BillingClient from "./BillingClient";
import { getT } from "@/lib/i18n/server";

export default async function BillingPage() {
  const t = await getT();

  const supabase = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/dashboard/billing");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, subscription_plan, subscription_status, billing_status, subscription_expires_at")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) redirect("/auth?next=/dashboard/billing");

  const { data: branches } = await supabase
    .from("branches")
    .select("id")
    .eq("account_id", account.id);
  const branchList = branches ?? [];
  const branchCount = branchList.length;

  const { count: connectedSuppliers } = await supabase
    .from("branch_supplier_connections")
    .select("id", { count: "exact", head: true })
    .in("branch_id", branchList.map((b) => b.id))
    .eq("status", "approved");

  const { data: plansData, error: plansError } = await getPlans(supabase, "pharmacy");
  const plans = (plansData ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price_monthly_tzs: p.price_monthly_tzs,
    price_annual_tzs: p.price_annual_tzs,
    max_branches: p.max_branches,
    max_operators: p.max_operators,
    max_suppliers: p.max_suppliers,
    features: Array.isArray(p.features) ? p.features.map((f) => String(f)) : [],
  }));

  const currentPlan = plans.find((p) => p.name === account.subscription_plan) ?? null;
  const subscribed = isSubscribedActive(account);

  const { data: settings } = await supabase
    .from("payment_settings")
    .select("payme_wallet_number")
    .eq("account_id", account.id)
    .maybeSingle();
  const walletHint = (settings as { payme_wallet_number?: string | null } | null)?.payme_wallet_number ?? undefined;

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar accountName={account?.name} />

      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <h2 className="font-headline-md text-headline-md text-ink-deep">
            {t("portal.billing")}
          </h2>
        </header>

        <main className="flex-grow pt-24 pb-24 px-8 max-w-container-max mx-auto w-full">
          <div className="mb-8">
            <h1 className="font-headline-lg text-headline-lg text-ink-deep mb-1">
              {t("billing.title")}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("billing.subtitle")}
            </p>
          </div>

          {/* Pay-now strip */}
          <div className="bg-surface-base border border-outline-variant rounded p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-1">
                Subscription status
              </p>
              <p className="font-headline-md text-headline-md text-ink-deep">
                {subscribed ? "Active" : "Inactive"}
                {account.subscription_expires_at && (
                  <span className="ml-3 text-sm font-body-md text-on-surface-variant">
                    Paid until {new Date(account.subscription_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Pay monthly via mobile money to keep ordering from your connected suppliers.
                Connected suppliers: <strong>{connectedSuppliers ?? 0}</strong>
                {currentPlan ? ` / ${currentPlan.max_suppliers >= 999999 ? "∞" : currentPlan.max_suppliers}` : ""}.
              </p>
            </div>
            {currentPlan ? (
              <div className="w-full md:w-64">
                <PlanPayButton plan={currentPlan} audience="pharmacy" walletHint={walletHint} label={`Pay now — TZS ${currentPlan.price_monthly_tzs.toLocaleString()}`} />
              </div>
            ) : null}
          </div>

          {plansError ? (
            <p className="text-error mb-4">{plansError}</p>
          ) : (
            <BillingClient
              account={{
                id: account.id,
                name: account.name,
                subscription_plan: account.subscription_plan,
                subscription_status: account.subscription_status,
                billing_status: account.billing_status,
              }}
              currentPlanName={currentPlan?.name}
              plans={plans}
              branchCount={branchCount}
              connectedSuppliers={connectedSuppliers ?? 0}
              selectPlanAction={selectPlan}
            />
          )}
        </main>
      </div>
    </div>
  );
}