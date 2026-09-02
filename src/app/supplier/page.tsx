/**
 * @route /supplier
 * @access Authenticated supplier accounts only. Pharmacy accounts are redirected to /dashboard.
 * @description Supplier portal home dashboard. Shows KPIs (quote stats, order stats),
 *   recent activity, and quick-access cards to catalog/orders/analytics.
 *
 * @data getSupplierDashboardData() — live accounts, quote_requests, and orders rows.
 *
 * Note: `account?.type !== "supplier"` also handles the null account case —
 * null?.type is undefined which !== "supplier", so the redirect fires safely.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import Link from "next/link";
import { getSupplierDashboardData } from "@/lib/actions/supplier";
import { getT } from "@/lib/i18n/server";

export default async function SupplierDashboard() {
  const t = await getT();
  const dashboard = await getSupplierDashboardData();
  if (!dashboard) redirect("/dashboard");

  const { account, quotes, pendingOrders, deliveredCount } = dashboard;
  const pendingCount = quotes.filter((q) => q.status === "pending").length;

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />

      <div className="ml-64 flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10 justify-between">
          <div>
            <h1 className="font-headline-md text-headline-md text-ink-deep">
              {t("sup.dashboard.title")}
            </h1>
          </div>
          <Link
            href="/supplier/quote"
            className="bg-ink-deep text-white px-6 py-2 font-label-md text-label-md hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            {t("sup.dashboard.new_quote")}
          </Link>
        </header>

        <main className="flex-grow pt-24 pb-16 px-8">
          {/* KPI strip */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[
              { labelKey: "sup.dashboard.kpi.open_quotes", value: pendingCount, icon: "request_quote", colour: "text-primary" },
              { labelKey: "sup.dashboard.kpi.total_requests", value: quotes.length, icon: "receipt_long", colour: "text-secondary" },
              { labelKey: "sup.dashboard.kpi.pending_orders", value: dashboard?.pendingOrders ?? 0, icon: "pending_actions", colour: "text-amber-600" },
              { labelKey: "sup.dashboard.kpi.delivered", value: dashboard?.deliveredCount ?? 0, icon: "local_shipping", colour: "text-tertiary" },
            ].map((kpi) => (
              <div key={kpi.labelKey} className="bg-surface-base border border-outline-variant p-6 custom-notch-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`material-symbols-outlined text-[20px] ${kpi.colour}`}>{kpi.icon}</span>
                  <span className="font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                    {t(kpi.labelKey)}
                  </span>
                </div>
                <div className={`font-headline-lg text-headline-lg ${kpi.colour}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Quote requests table */}
          <div className="bg-surface-base border border-outline-variant rounded">
            <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-headline-md text-headline-md text-ink-deep">{t("sup.dashboard.recent_quotes")}</h2>
              <Link href="/supplier/quote" className="font-label-md text-label-md text-primary hover:underline flex items-center gap-1">
                {t("sup.dashboard.new_request")} <span className="material-symbols-outlined text-[16px]">add</span>
              </Link>
            </div>

            {quotes.length === 0 ? (
              <div className="p-12 text-center">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant/20 mb-4 block">
                  request_quote
                </span>
                <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                  {t("sup.dashboard.no_quotes")}
                </p>
                <Link
                  href="/supplier/quote"
                  className="inline-flex items-center gap-2 bg-primary text-on-primary font-label-md text-label-md px-6 py-2 rounded hover:opacity-90"
                >
                  {t("sup.dashboard.submit_first")}
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-container-low">
                    <tr>
                      {["sup.dashboard.col.company", "sup.dashboard.col.contact", "sup.dashboard.col.status", "sup.dashboard.col.date", "sup.dashboard.col.actions"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider"
                        >
                          {t(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {quotes.map((q) => (
                      <tr key={q.id} className="hover:bg-surface-container-low/30 transition-colors">
                        <td className="px-6 py-4 font-body-md text-body-md text-ink-deep">
                          {q.company_name}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-body-sm text-body-sm text-ink-deep">{q.contact_name}</p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">{q.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-label-md ${
                            q.status === "contacted"
                              ? "bg-secondary/10 text-secondary"
                              : "bg-amber-50 text-amber-700"
                          }`}>
                            {q.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                          {new Date(q.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <button className="text-primary font-label-md text-label-md hover:underline text-sm">
                            {t("sup.dashboard.view")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
