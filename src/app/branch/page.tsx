import { redirect } from "next/navigation";
import Link from "next/link";
import { getBranchDashboard } from "@/lib/actions/branch";

export default async function BranchHomePage() {
  const data = await getBranchDashboard();
  if (!data) redirect("/auth?next=/branch");

  const kpis = [
    {
      label: "Stock keeping units",
      value: data.totalSku,
      icon: "inventory_2",
      color: "text-primary",
      href: "/branch/stock",
    },
    {
      label: "Units on hand",
      value: data.totalUnits.toLocaleString(),
      icon: "widgets",
      color: "text-secondary",
      href: "/branch/stock",
    },
    {
      label: "Expiring ≤ 30 days",
      value: data.expiringSoon,
      icon: "timer",
      color: data.expiringSoon > 0 ? "text-amber-600" : "text-secondary",
      href: "/branch/stock",
    },
    {
      label: "Pending orders",
      value: data.pendingOrders,
      icon: "receipt_long",
      color: data.pendingOrders > 0 ? "text-primary" : "text-on-surface-variant",
      href: "/branch/orders",
    },
    {
      label: "Sales today",
      value: `TSh ${data.todaySalesTotal.toLocaleString()}`,
      icon: "payments",
      color: "text-primary",
      href: "/branch/transactions",
    },
    {
      label: "Expired batches",
      value: data.expired,
      icon: "warning",
      color: data.expired > 0 ? "text-error" : "text-on-surface-variant",
      href: "/branch/stock",
    },
  ];

  return (
    <div className="p-8 max-w-container-max mx-auto w-full">
      <div className="mb-8">
        <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-1">
          {data.branch.name}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {data.account.name} — {data.branch.subscription_status === "active" ? "Subscription active" : data.branch.subscription_status ?? "No subscription"}
          {data.lastSyncedAt && (
            <> · Last synced {new Date(data.lastSyncedAt).toLocaleString()}</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="bg-surface-base border border-outline-variant rounded p-5 custom-notch-sm hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`material-symbols-outlined text-[20px] ${kpi.color}`}>{kpi.icon}</span>
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs">
                {kpi.label}
              </span>
            </div>
            <div className={`font-headline-lg text-headline-lg ${kpi.color}`}>{kpi.value}</div>
          </Link>
        ))}
      </div>

      {data.expiringSoon > 0 && (
        <div className="mt-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
          <span className="material-symbols-outlined text-[16px] align-middle mr-1">warning</span>
          {data.expiringSoon} batch{data.expiringSoon > 1 ? "es" : ""} expir{data.expiringSoon > 1 ? "y" : "ies"} within 30 days — review stock rotation.
        </div>
      )}
    </div>
  );
}