"use client";

import { useState } from "react";
import Toast from "@/components/Toast";

interface Plan {
  id: string;
  name: string;
  price_monthly_tzs: number;
  price_annual_tzs: number;
  max_branches: number;
  max_operators: number;
  max_suppliers: number;
  features: string[];
}

interface Account {
  id: string;
  name: string;
  subscription_plan: string | null;
  subscription_status: string;
  billing_status: string;
}

interface BillingClientProps {
  account: Account;
  currentPlanName?: string;
  plans: Plan[];
  branchCount: number;
  connectedSuppliers?: number;
  selectPlanAction: (planId: string) => Promise<{ error: string | null; suspendedBranchIds?: string[] }>;
}

function formatTzs(amount: number): string {
  return "TZS " + Math.round(amount).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-secondary/10 text-secondary",
    trial: "bg-primary/10 text-primary",
    payment_due: "bg-amber-100 text-amber-700",
    grace: "bg-amber-100 text-amber-700",
    locked: "bg-error-container text-error",
    paused: "bg-surface-container text-on-surface-variant",
  };
  const cls = styles[status] ?? "bg-surface-container text-on-surface-variant";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-label-md capitalize ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function BillingClient({
  account,
  currentPlanName,
  plans,
  branchCount,
  connectedSuppliers = 0,
  selectPlanAction,
}: BillingClientProps) {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmPlanId, setConfirmPlanId] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    setLoading(true);
    try {
      const result = await selectPlanAction(planId);
      if (result.error) {
        setToast({ message: result.error, type: "error" });
      } else {
        const suspended = result.suspendedBranchIds?.length;
        if (suspended) {
          setToast({
            message: `Plan updated. ${suspended} branch${suspended > 1 ? "es" : ""} suspended (max_branches exceeded).`,
            type: "info",
          });
        } else {
          setToast({ message: "Plan updated successfully.", type: "success" });
        }
        setConfirmPlanId(null);
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  const selectedPlan = plans.find((p) => p.id === account.subscription_plan);

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface-base border border-outline-variant rounded p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-primary">account_circle</span>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Account</p>
          </div>
          <p className="font-headline-md text-headline-md text-ink-deep">{account.name}</p>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-primary">workspace_premium</span>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Current Plan</p>
          </div>
          <p className="font-headline-md text-headline-md text-ink-deep">{currentPlanName ?? "No plan selected"}</p>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-primary">store</span>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Branches</p>
          </div>
          <p className="font-headline-md text-headline-md text-ink-deep">{branchCount}</p>
        </div>

        <div className="bg-surface-base border border-outline-variant rounded p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-primary">hub</span>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Suppliers</p>
          </div>
          <p className="font-headline-md text-headline-md text-ink-deep">{connectedSuppliers}</p>
        </div>
      </div>

      <div className="bg-surface-base border border-outline-variant rounded p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-headline-md text-headline-md text-ink-deep">Subscription Status</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Your current subscription state</p>
          </div>
          <StatusBadge status={account.subscription_status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-label-md text-label-md text-on-surface-variant">Billing:</span>
          <StatusBadge status={account.billing_status} />
        </div>
      </div>

      <h2 className="font-headline-md text-headline-md text-ink-deep mb-4">Available Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = plan.id === account.subscription_plan;
          const isDowngrade = selectedPlan && plan.price_monthly_tzs < selectedPlan.price_monthly_tzs;
          const wouldExceed = branchCount > plan.max_branches;

          return (
            <div
              key={plan.id}
              className={`bg-surface-base border rounded p-6 flex flex-col transition-all ${
                isCurrentPlan
                  ? "border-primary border-2 shadow-md"
                  : "border-outline-variant hover:border-primary/50"
              }`}
            >
              {isCurrentPlan && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                  <span className="font-label-md text-label-md text-primary uppercase tracking-wider">Current Plan</span>
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <h3 className="font-headline-md text-headline-md text-ink-deep">{plan.name}</h3>
              </div>

              <div className="mb-4 space-y-1">
                <div className="flex justify-between font-body-sm">
                  <span className="text-on-surface-variant">Monthly</span>
                  <span className="font-mono text-ink-deep">{formatTzs(plan.price_monthly_tzs)}</span>
                </div>
                <div className="flex justify-between font-body-sm">
                  <span className="text-on-surface-variant">Annual</span>
                  <span className="font-mono text-ink-deep">{formatTzs(plan.price_annual_tzs)}</span>
                </div>
                <div className="flex justify-between font-body-sm">
                  <span className="text-on-surface-variant">Max Branches</span>
                  <span className="font-mono text-ink-deep">{plan.max_branches}</span>
                </div>
                <div className="flex justify-between font-body-sm">
                  <span className="text-on-surface-variant">Max Operators</span>
                  <span className="font-mono text-ink-deep">{plan.max_operators}</span>
                </div>
                <div className="flex justify-between font-body-sm">
                  <span className="text-on-surface-variant">Max Suppliers</span>
                  <span className="font-mono text-ink-deep">{plan.max_suppliers >= 999999 ? "∞" : plan.max_suppliers}</span>
                </div>
              </div>

              <div className="flex-1 mb-4">
                <p className="font-label-md text-label-md text-xs text-on-surface-variant uppercase tracking-wider mb-2">Features</p>
                <ul className="space-y-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                      <span className="material-symbols-outlined text-[14px] text-secondary mt-0.5">check</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {wouldExceed && !isCurrentPlan && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">warning</span>
                  Your {branchCount} branches exceed this plan&apos;s limit of {plan.max_branches}. Downgrading will lock {branchCount - plan.max_branches} branch{branchCount - plan.max_branches > 1 ? "es" : ""}.
                  {connectedSuppliers > plan.max_suppliers && plan.max_suppliers < 999999 && (
                    <span className="block mt-1">
                      You also have {connectedSuppliers} connected suppliers — this plan allows {plan.max_suppliers}. Extra connections must be removed first.
                    </span>
                  )}
                </div>
              )}

              {!isCurrentPlan && (
                <button
                  onClick={() => setConfirmPlanId(plan.id)}
                  className="w-full px-4 py-2 bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  {isDowngrade ? "Downgrade" : "Subscribe"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {confirmPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setConfirmPlanId(null)} />
          <div className="relative bg-surface-container-lowest border border-outline-variant rounded p-6 w-full max-w-md shadow-xl">
            {(() => {
              const plan = plans.find((p) => p.id === confirmPlanId);
              if (!plan) return null;
              const wouldExceed = branchCount > plan.max_branches;

              return (
                <>
                  <h3 className="font-headline-md text-headline-md text-ink-deep mb-1">
                    Confirm Plan Change
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
                    You are switching to <strong>{plan.name}</strong>.
                  </p>

                  {wouldExceed && (
                    <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                      <span className="material-symbols-outlined text-[16px] align-middle mr-1">warning</span>
                      This plan supports up to {plan.max_branches} branch{plan.max_branches > 1 ? "es" : ""}, but you have {branchCount}. The oldest {branchCount - plan.max_branches} branch{branchCount - plan.max_branches > 1 ? "es" : ""} will be locked.
                    </div>
                  )}

                  {connectedSuppliers > plan.max_suppliers && plan.max_suppliers < 999999 && (
                    <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                      <span className="material-symbols-outlined text-[16px] align-middle mr-1">warning</span>
                      You have {connectedSuppliers} connected suppliers, but this plan allows {plan.max_suppliers}. Extra connections will need to be removed.
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectPlan(confirmPlanId)}
                      disabled={loading}
                      className="px-4 py-2 bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60 flex items-center gap-2"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
                      ) : (
                        <span className="material-symbols-outlined text-[16px]">check</span>
                      )}
                      Confirm Change
                    </button>
                    <button
                      onClick={() => setConfirmPlanId(null)}
                      className="px-4 py-2 border border-outline-variant text-on-surface-variant font-label-md text-label-md"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
