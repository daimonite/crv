/**
 * @route /supplier/subscription
 * @access Authenticated supplier accounts only.
 * @description Supplier subscription hub: current status, connected-pharmacy
 * usage vs plan cap, and pay-as-you-go plan cards priced per connected pharmacy
 * (Starter 5,000 TZS / Growth 15,000 / Enterprise 40,000, monthly). Payments
 * flow through Payme Africa; the webhook activates a 30-day subscription.
 */
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlans, isSubscribedActive } from "@/lib/subscription";
import SupplierSidebar from "@/components/SupplierSidebar";
import Link from "next/link";
import PlanPayButton from "@/components/PlanPayButton";

const UNLIMITED = 999999;

export default async function SupplierSubscriptionPage() {
  const supabase = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/subscription");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, subscription_status, subscription_expires_at, subscription_plan, download_enabled, verified, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  if (account?.type !== "supplier") redirect("/dashboard");

  const { data: plans, error: plansError } = await getPlans(supabase, "supplier");
  const { count: connectedCount } = await supabase
    .from("branch_supplier_connections")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", account.id)
    .eq("status", "approved");

  const currentPlan = plans?.find((p) => p.name === account.subscription_plan) ?? plans?.[0] ?? null;
  const subscribed = isSubscribedActive(account) || (account.trial_ends_at && new Date(account.trial_ends_at) > new Date());

  const statusConfig = subscribed
    ? {
        label: "Active",
        description: "Your supplier subscription is active. Keep it active to stay connected to pharmacies.",
        color: "text-success bg-success/10 border-success/20",
        icon: "check_circle",
      }
    : {
        label: "Inactive",
        description: "No active subscription. Choose a plan below to keep connecting with pharmacies — starting at 5,000 TZS/month.",
        color: "text-error bg-error/10 border-error/20",
        icon: "error",
      };

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              Account overview
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">Subscription</h1>
          </div>
        </header>

        <main className="pt-24 pb-16 px-8 flex-1 max-w-container-max mx-auto w-full">
          {/* Status + usage card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <div className="bg-surface-base border border-outline-variant rounded-lg p-6 lg:col-span-2">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${statusConfig.color.split(" ").slice(1).join(" ")}`}>
                  <span className={`material-symbols-outlined text-[24px] ${statusConfig.color.split(" ")[0]}`}>{statusConfig.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-headline-md text-headline-md text-ink-deep">Subscription status</h2>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-label-md border ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant">{statusConfig.description}</p>
                  <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-outline-variant">
                    <div>
                      <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-1">Current plan</p>
                      <p className="font-body-lg text-body-lg text-ink-deep">
                        {account.subscription_plan ?? "No plan selected"}
                      </p>
                    </div>
                    {account.subscription_expires_at && (
                      <div>
                        <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-1">Paid until</p>
                        <p className="font-body-lg text-body-lg text-ink-deep">
                          {new Date(account.subscription_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-base border border-outline-variant rounded-lg p-6">
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-1">
                Connected pharmacies
              </p>
              <p className="font-headline-lg text-headline-lg text-ink-deep">
                {connectedCount ?? 0}{" "}
                <span className="text-on-surface-variant text-lg font-body-md">
                  / {currentPlan && currentPlan.max_connected_pharmacies >= UNLIMITED ? "∞" : currentPlan?.max_connected_pharmacies ?? 0}
                </span>
              </p>
              {currentPlan && currentPlan.max_connected_pharmacies >= UNLIMITED ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">Unlimited connections on your Enterprise plan.</p>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                  Your plan allows {currentPlan?.max_connected_pharmacies ?? 0} approved connections. Upgrade to connect more.
                </p>
              )}
              <Link
                href="/supplier/connections"
                className="inline-flex items-center gap-1 mt-4 text-primary font-label-md text-label-md hover:underline"
              >
                Manage connections <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Plan cards */}
          <h2 className="font-headline-md text-headline-md text-ink-deep mb-1">Choose a supplier plan</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
            Billed monthly via mobile money. In sandbox mode payments are simulated and confirmed instantly.
          </p>

          {plansError ? (
            <p className="text-error">{plansError}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(plans ?? []).map((plan) => {
                const isCurrent = plan.name === account.subscription_plan;
                const unlimited = plan.max_connected_pharmacies >= UNLIMITED;
                return (
                  <div
                    key={plan.id}
                    className={`bg-surface-base border rounded-xl p-6 flex flex-col transition-all ${
                      isCurrent ? "border-primary border-2 shadow-md" : "border-outline-variant hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-label-md text-label-md text-primary uppercase tracking-wider text-xs mb-1">
                          {plan.name.split("(")[1]?.replace(")", "") ?? "Plan"}
                        </p>
                        <h3 className="font-headline-md text-headline-md text-ink-deep">{plan.name}</h3>
                      </div>
                      {isCurrent && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label-md bg-secondary/10 text-secondary">
                          Current
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="font-headline-lg text-headline-lg text-ink-deep">
                        TZS {plan.price_monthly_tzs.toLocaleString()}
                      </span>
                      <span className="text-on-surface-variant text-sm">/month</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-5">
                      {unlimited ? "Unlimited connected pharmacies" : `Up to ${plan.max_connected_pharmacies} connected pharmacies`}
                    </p>

                    <ul className="flex-1 space-y-2 mb-6">
                      {(plan.features ?? []).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                          <span className="material-symbols-outlined text-[14px] text-secondary mt-0.5">check</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <PlanPayButton plan={plan} audience="supplier" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Extras */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            <div className="bg-surface-base border border-outline-variant rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${account.download_enabled ? "bg-success/10" : "bg-surface-container-low"}`}>
                  <span className={`material-symbols-outlined text-[20px] ${account.download_enabled ? "text-success" : "text-on-surface-variant"}`}>
                    {account.download_enabled ? "download" : "download_for_offline"}
                  </span>
                </div>
                <div>
                  <h3 className="font-label-md text-label-md text-ink-deep">Desktop app access</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {account.download_enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-surface-base border border-outline-variant rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${account.verified ? "bg-primary/10" : "bg-surface-container-low"}`}>
                  <span className={`material-symbols-outlined text-[20px] ${account.verified ? "text-primary" : "text-on-surface-variant"}`}>
                    {account.verified ? "verified" : "info"}
                  </span>
                </div>
                <div>
                  <h3 className="font-label-md text-label-md text-ink-deep">Marketplace verification</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {account.verified ? "Verified" : "Not verified"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-8 mt-4 border-t border-outline-variant">
            <Link
              href="/support"
              className="inline-flex items-center gap-2 bg-ink-deep text-white px-6 py-3 font-label-md text-label-md hover:opacity-90 transition-opacity rounded"
            >
              <span className="material-symbols-outlined text-[16px]">contact_support</span>
              Contact HQ
            </Link>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Questions about billing, renewals, or plan upgrades — our team is one message away.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}