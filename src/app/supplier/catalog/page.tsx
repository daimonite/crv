/**
 * @route /supplier/catalog
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @data Live Supabase data via getSupplierCatalog() — no mock rows.
 * @renders SupplierCatalogManager — filterable product table with status management.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import SupplierCatalogManager, { type CatalogProduct } from "@/components/SupplierCatalogManager";
import { getSupplierCatalog } from "@/lib/actions/supplier";
import { getT } from "@/lib/i18n/server";

export default async function SupplierCatalogPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/catalog");

  const [
    { data: account },
    catalog,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("name, type")
      .eq("auth_user_id", user.id)
      .single(),
    getSupplierCatalog(),
  ]);

  // Enforce supplier-only access — pharmacy users navigating here are sent back
  if (account?.type !== "supplier") redirect("/dashboard");

  const activeCount = catalog.filter((p) => p.status === "active").length;

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center justify-between px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.catalog.product_listings")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("sup.catalog.title")}</h1>
          </div>
          <div className="font-mono text-label-md text-on-surface-variant uppercase">
            {t("sup.catalog.active_products", String(activeCount)).replace("{n}", String(activeCount))}
          </div>
        </header>
        <div className="pt-16 flex-1 flex">
          <SupplierCatalogManager initialProducts={catalog as CatalogProduct[]} />
        </div>
      </div>
    </div>
  );
}
