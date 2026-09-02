/**
 * @route /supplier/alerts
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @description Shows products where stock_qty < min_order_qty (low stock alerts).
 *         Pharmacies don't see this page — it's supplier-specific.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import { getT } from "@/lib/i18n/server";

interface LowStockAlert {
  id: string;
  productName: string;
  sku: string | null;
  category: string | null;
  stockQty: number;
  minOrderQty: number;
  leadTimeDays: number | null;
  packSize: string | null;
}

export default async function SupplierAlertsPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/alerts");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("auth_user_id", user.id)
    .single();

  if (account?.type !== "supplier") redirect("/dashboard");

  type CatalogRow = {
    id: string;
    sku: string | null;
    pack_size: string | null;
    stock_qty: number;
    min_order_qty: number;
    lead_time_days: number | null;
    products: { id: string; generic_name: string; brand_name: string | null; category: string | null } | null;
  };

  const { data } = await supabase
    .from("supplier_catalog")
    .select("id, sku, pack_size, stock_qty, min_order_qty, lead_time_days, products(id, generic_name, brand_name, category)")
    .eq("supplier_id", account.id)
    .eq("status", "active")
    .lt("stock_qty", 1);

  const alerts = ((data ?? []) as unknown as CatalogRow[])
    .filter(row => row.stock_qty < row.min_order_qty)
    .map(row => ({
      id: row.id,
      productName: row.products?.brand_name ?? row.products?.generic_name ?? "Unnamed product",
      sku: row.sku,
      category: row.products?.category ?? "Other",
      stockQty: row.stock_qty,
      minOrderQty: row.min_order_qty,
      leadTimeDays: row.lead_time_days ?? 0,
      packSize: row.pack_size,
    }));

  const criticalCount = alerts.filter(a => a.stockQty === 0).length;
  const warningCount = alerts.filter(a => a.stockQty > 0).length;

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center justify-between px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.alerts.inventory_health")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("sup.alerts.title")}</h1>
          </div>
          {alerts.length > 0 && (
            <div className="flex items-center gap-4">
              {criticalCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
                  <span className="font-mono text-label-md text-error uppercase">
                    {t("sup.alerts.out_of_stock", String(criticalCount)).replace("{n}", String(criticalCount))}
                  </span>
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                  <span className="font-mono text-label-md text-amber-600 uppercase">
                    {t("sup.alerts.low_stock", String(warningCount)).replace("{n}", String(warningCount))}
                  </span>
                </div>
              )}
            </div>
          )}
        </header>

        <main className="pt-16 flex-1 px-8 py-8">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <span className="material-symbols-outlined text-[64px] text-success/40 mb-4">check_circle</span>
              <h2 className="font-headline-md text-headline-md text-ink-deep mb-2">{t("sup.alerts.all_healthy")}</h2>
              <p className="font-body-md text-body-md text-on-surface-variant text-center max-w-sm">
                {t("sup.alerts.all_healthy_body")}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-surface-base border border-outline-variant rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low">
                  <h2 className="font-headline-md text-headline-md text-ink-deep">{t("sup.alerts.low_stock_products")}</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {t("sup.alerts.low_stock_body")}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-container-low">
                      <tr>
                        {["sup.alerts.col.product", "sup.alerts.col.sku", "sup.alerts.col.category", "sup.alerts.col.current_stock", "sup.alerts.col.reorder_point", "sup.alerts.col.lead_time", "sup.alerts.col.status"].map((h) => (
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
                      {alerts.map((alert) => (
                        <tr key={alert.id} className="hover:bg-surface-container-low/30 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-body-md text-body-md text-ink-deep font-medium">{alert.productName}</p>
                            {alert.packSize && (
                              <p className="font-body-sm text-body-sm text-on-surface-variant">{t("sup.alerts.pack").replace("{size}", alert.packSize)}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-label-md text-on-surface-variant">
                              {alert.sku ?? "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                              {alert.category}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`font-headline-md text-headline-md font-bold ${
                              alert.stockQty === 0 ? "text-error" : "text-amber-600"
                            }`}>
                              {alert.stockQty}
                            </span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant ml-1">{t("sup.alerts.units")}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-body-md text-body-md text-on-surface-variant">
                              {alert.minOrderQty}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-body-md text-body-md text-on-surface-variant">
                              {alert.leadTimeDays > 0 ? t("sup.alerts.days", String(alert.leadTimeDays)).replace("{n}", String(alert.leadTimeDays)) : "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {alert.stockQty === 0 ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-label-md bg-error/10 text-error">
                                {t("sup.alerts.out_of_stock_badge")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-label-md bg-amber-50 text-amber-700">
                                {t("sup.alerts.low_stock_badge")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-surface-base border border-outline-variant rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-primary mt-0.5">lightbulb</span>
                  <div>
                    <h3 className="font-label-md text-label-md text-ink-deep mb-1">{t("sup.alerts.restocking_tip")}</h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {t("sup.alerts.restocking_body")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
