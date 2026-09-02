/**
 * @route /supplier/analytics
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @data Live Supabase aggregation via getSupplierAnalytics() — no mock rows.
 * @renders SupplierAnalyticsChart — bar chart, top products table, KPI strip.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import SupplierAnalyticsChart from "@/components/SupplierAnalyticsChart";
import { getSupplierAnalytics } from "@/lib/actions/supplier";
import { getT } from "@/lib/i18n/server";

export default async function SupplierAnalyticsPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/analytics");

  const [
    { data: account },
    analytics,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("name, type")
      .eq("auth_user_id", user.id)
      .single(),
    getSupplierAnalytics(),
  ]);

  // Enforce supplier-only access
  if (account?.type !== "supplier") redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center justify-between px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.analytics.sales_trends")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("sup.analytics.title")}</h1>
          </div>
          <div className="font-mono text-label-md text-on-surface-variant uppercase">
            {t("sup.analytics.months_view")}
          </div>
        </header>
        <div className="pt-16 flex-1 flex">
          <SupplierAnalyticsChart
            data={analytics.monthly}
            topProducts={analytics.topProducts}
            conversionRate={analytics.conversionRate}
          />
        </div>
      </div>
    </div>
  );
}
