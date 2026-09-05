/**
 * @route /dashboard
 * @access Authenticated pharmacy accounts only. Suppliers are redirected to /supplier.
 * @description Main pharmacy dashboard. Uses the getPharmacyDashboardData() server
 *   action for all data fetching. Renders:
 *   - KPI strip (branches online, trial ends, expiring batches, billing status)
 *   - Leaflet network map with branch markers
 *   - Branch list with subscription status
 *   - Expiring batches table (FEFO sorted)
 *
 * @data Reads: accounts, branches, batches (joined with products) — via server action.
 */
import { redirect } from "next/navigation";
import { getPharmacyDashboardData } from "@/lib/actions/pharmacy";
import PharmacySidebar from "@/components/PharmacySidebar";
import Link from "next/link";
import CervosMap from "@/components/MapClientWrapper";
import { getT } from "@/lib/i18n/server";

export default async function DashboardPage() {
  const t = await getT();

  const data = await getPharmacyDashboardData();
  if (!data) redirect("/auth?next=/dashboard");

  const { account, branches, expiringBatches } = data;

  if (account.type === "supplier") redirect("/supplier");

  const activeBranches = branches.filter((b) => b.subscription_status === "active");
  const graceBranches = branches.filter((b) => b.subscription_status === "grace");

  const mapMarkers = branches
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => ({
      lat: b.lat as number,
      lng: b.lng as number,
      label: b.name,
      status: b.subscription_status as "online" | "offline" | "grace",
    }));

  const firstBranch = branches[0];

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar
        branchName={firstBranch?.name}
        accountName={account?.name}
      />

      <div className="ml-64 flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10 gap-4">
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-secondary block animate-pulse" />
              {t(activeBranches.length === 1 ? "dash.branches.active" : "dash.branches.active.p").replace("{n}", String(activeBranches.length))}
            </div>
            <Link
              href="/download"
              className="flex items-center gap-1 font-label-md text-label-md px-4 py-2 rounded transition-colors bg-primary text-on-primary hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              {t("portal.download")}
            </Link>
          </div>
        </header>

        <main className="flex-grow pt-24 pb-24 px-8 max-w-container-max mx-auto w-full">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="font-headline-lg text-headline-lg text-ink-deep mb-1">
              {t("dash.greeting")}{" "}
              <span className="text-primary">{account.name ?? "Pharmacy"}</span>
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("dash.subtitle")}
            </p>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              {
                labelKey: "dash.kpi.active",
                value: activeBranches.length,
                icon: "store",
                colour: "text-primary",
              },
              {
                labelKey: "dash.kpi.grace",
                value: graceBranches.length,
                icon: "warning",
                colour: "text-amber-600",
              },
              {
                labelKey: "dash.kpi.expiring",
                value: expiringBatches.length,
                icon: "timer",
                colour: "text-error",
              },
              {
                labelKey: "dash.kpi.billing",
                value:
                  account.billing_status === "active"
                    ? t("dash.kpi.billing.active")
                    : t("dash.kpi.billing.inactive"),
                icon: "credit_card",
                colour:
                  account.billing_status === "active"
                    ? "text-secondary"
                    : "text-error",
              },
            ].map((kpi) => (
              <div
                key={kpi.labelKey}
                className="bg-surface-base border border-outline-variant rounded p-5 custom-notch-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`material-symbols-outlined text-[20px] ${kpi.colour}`}
                  >
                    {kpi.icon}
                  </span>
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs">
                    {t(kpi.labelKey)}
                  </span>
                </div>
                <div className={`font-headline-lg text-headline-lg ${kpi.colour}`}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Branch map */}
            <div className="lg:col-span-7 bg-surface-base border border-outline-variant rounded overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
                <h2 className="font-headline-md text-headline-md text-ink-deep">
                  {t("dash.networkmap")}
                </h2>
                <span className="font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider">
                  {t(branches.length === 1 ? "dash.branch.count" : "dash.branch.count.p").replace("{n}", String(branches.length))}
                </span>
              </div>
              <div className="h-72">
                {mapMarkers.length > 0 ? (
                  <CervosMap
                    center={
                      mapMarkers.length > 0
                        ? [mapMarkers[0].lat, mapMarkers[0].lng]
                        : [-6.816, 39.2803]
                    }
                    zoom={12}
                    markers={mapMarkers}
                    className="h-72 w-full"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center bg-surface-container-low">
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {t("dash.nolocation")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Branch list */}
            <div className="lg:col-span-5 bg-surface-base border border-outline-variant rounded flex flex-col">
              <div className="px-6 py-4 border-b border-outline-variant">
                <h2 className="font-headline-md text-headline-md text-ink-deep">
                  {t("dash.branches")}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/40 max-h-72">
                {branches.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {t("dash.nobranches")}
                    </p>
                  </div>
                ) : (
                  branches.map((b) => {
                    const statusColor =
                      b.subscription_status === "active"
                        ? "bg-secondary"
                        : b.subscription_status === "grace"
                        ? "bg-amber-500"
                        : "bg-error";
                    return (
                      <div
                        key={b.id}
                        className="px-6 py-4 flex items-center justify-between hover:bg-surface-container-low/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${statusColor} flex-shrink-0`}
                          />
                          <div>
                            <p className="font-body-md text-body-md text-ink-deep">
                              {b.name}
                            </p>
                            <p className="font-body-sm text-body-sm text-on-surface-variant capitalize">
                              {b.subscription_status}
                            </p>
                          </div>
                        </div>
                        {b.last_synced_at && (
                          <span className="font-label-md text-label-md text-on-surface-variant text-xs">
                            {new Date(b.last_synced_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Expiring batches */}
            <div className="lg:col-span-12 bg-surface-base border border-outline-variant rounded">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
                <h2 className="font-headline-md text-headline-md text-ink-deep">
                  {t("dash.expiring.title")}
                </h2>
                <Link
                  href="/dashboard/inventory"
                  className="font-label-md text-label-md text-primary hover:underline flex items-center gap-1"
                >
                  {t("dash.viewall")}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
              <div className="overflow-x-auto">
                {expiringBatches.length === 0 ? (
                  <div className="p-8 text-center">
                    <span className="material-symbols-outlined text-[40px] text-secondary/40 mb-2 block">
                      check_circle
                    </span>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {t("dash.noexpiring")}
                    </p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-surface-container-low">
                      <tr>
                        {["dash.col.product", "dash.col.branch", "dash.col.qty", "dash.col.expiry", "dash.col.daysleft"].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-left px-6 py-3 font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider"
                            >
                              {t(h)}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {expiringBatches.map((batch) => {
                        const expiry = new Date(batch.expiry_date);
                        const daysLeft = Math.ceil(
                          (expiry.getTime() - Date.now()) / 86400000
                        );
                        const product = Array.isArray(batch.products)
                          ? batch.products[0]
                          : batch.products;
                        const branch = Array.isArray(batch.branches)
                          ? batch.branches[0]
                          : batch.branches;
                        return (
                          <tr
                            key={batch.id}
                            className="hover:bg-surface-container-low/30 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-body-md text-body-md text-ink-deep">
                                  {product?.generic_name ?? "—"}
                                </p>
                                {product?.brand_name && (
                                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                                    {product.brand_name}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant">
                              {branch?.name ?? "—"}
                            </td>
                            <td className="px-6 py-4 font-body-md text-body-md">
                              {batch.quantity}
                            </td>
                            <td className="px-6 py-4 font-body-sm text-body-sm">
                              {expiry.toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-label-md ${
                                  daysLeft <= 7
                                    ? "bg-error-container text-error"
                                    : daysLeft <= 14
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-surface-container text-on-surface-variant"
                                }`}
                              >
                                {t("dash.days").replace("{n}", String(daysLeft))}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
