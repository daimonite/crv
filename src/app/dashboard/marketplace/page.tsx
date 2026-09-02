/**
 * @route /dashboard/marketplace
 * @access Authenticated pharmacy accounts only.
 * @description Supplier product catalogue browser for pharmacy users.
 *   Allows browsing, filtering by category, and building a quote basket.
 *
 * @data getMarketplaceProducts() — live ACTIVE supplier_catalog rows joined
 *   with the shared products master and supplier verification badge.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PharmacySidebar from "@/components/PharmacySidebar";
import MarketplaceBrowser, { type SupplierProduct } from "@/components/MarketplaceBrowser";
import { getMarketplaceProducts } from "@/lib/actions/supplier";
import { getT } from "@/lib/i18n/server";

export default async function MarketplacePage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/dashboard/marketplace");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, download_enabled")
    .eq("auth_user_id", user.id)
    .single();

  // Enforce pharmacy-only access — supplier users are redirected to their own portal
  if (account?.type !== "pharmacy") redirect("/supplier");

  const [
    { data: branches },
    products,
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("account_id", account.id),
    getMarketplaceProducts(),
  ]);

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar
        branchName={branches?.[0]?.name}
        accountName={account?.name}
      />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center justify-between px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("dash.marketplace.subtitle")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("dash.marketplace.title")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            <span className="font-mono text-label-md text-on-surface-variant uppercase">
              {t("dash.marketplace.verified").replace("{n}", String(products.filter((p) => p.verified).length))}
            </span>
          </div>
        </header>
        <div className="pt-16 flex-1 flex">
          <MarketplaceBrowser
            products={products as SupplierProduct[]}
            branches={branches ?? []}
          />
        </div>
      </div>
    </div>
  );
}
