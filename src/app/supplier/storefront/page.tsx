/**
 * @route /supplier/storefront
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @description Preview of how the supplier's storefront appears to pharmacies in the marketplace.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import { getT } from "@/lib/i18n/server";

interface StorefrontProduct {
  id: string;
  name: string;
  genericName: string;
  category: string;
  packSize: string | null;
  unitPrice: number;
  currency: string;
  minOrderQty: number;
  stockAvailable: number;
  leadTimeDays: number | null;
}

export default async function SupplierStorefrontPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/storefront");

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
    price: number;
    currency: string;
    min_order_qty: number;
    stock_qty: number;
    lead_time_days: number | null;
    products: { id: string; generic_name: string; brand_name: string | null; category: string | null } | null;
  };

  const [
    { data: paymentSettings },
    { data: catalogData },
  ] = await Promise.all([
    supabase
      .from("payment_settings")
      .select("accepted_methods, default_method")
      .eq("account_id", account.id)
      .maybeSingle(),
    supabase
      .from("supplier_catalog")
      .select("id, sku, pack_size, price, currency, min_order_qty, stock_qty, lead_time_days, products(id, generic_name, brand_name, category)")
      .eq("supplier_id", account.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
  ]);

  const products: StorefrontProduct[] = ((catalogData ?? []) as unknown as CatalogRow[]).map(row => ({
    id: row.id,
    name: row.products?.brand_name ?? row.products?.generic_name ?? "Unnamed product",
    genericName: row.products?.generic_name ?? "",
    category: row.products?.category ?? "Other",
    packSize: row.pack_size,
    unitPrice: Number(row.price),
    currency: row.currency,
    minOrderQty: row.min_order_qty,
    stockAvailable: row.stock_qty,
    leadTimeDays: row.lead_time_days,
  }));

  const categories = [...new Set(products.map(p => p.category))].sort();
  const paymentMethods = (paymentSettings?.accepted_methods as string[] | undefined) ?? [];

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.storefront.marketplace_preview")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("sup.storefront.your_storefront")}</h1>
          </div>
          <div className="ml-auto font-mono text-label-md text-on-surface-variant uppercase">
            {t("sup.storefront.active_listings", String(products.length)).replace("{n}", String(products.length))}
          </div>
        </header>

        <main className="pt-16 flex-1 px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-surface-base border border-outline-variant rounded-lg p-6">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[24px] text-primary">store</span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-headline-md text-headline-md text-ink-deep truncate">
                      {account?.name ?? "Your Company"}
                    </h2>
                    {(account as { tagline?: string | null })?.tagline && (
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{(account as { tagline?: string | null }).tagline}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-2">
                      {t("sup.storefront.categories")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {categories.length > 0 ? categories.map(cat => (
                        <span key={cat} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-label-md bg-surface-container-low text-on-surface-variant border border-outline-variant">
                          {cat}
                        </span>
                      )) : (
                        <span className="font-body-sm text-body-sm text-on-surface-variant">{t("sup.storefront.no_categories")}</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-2">
                      {t("sup.storefront.payment_methods")}
                    </p>
                    {paymentMethods.length > 0 ? (
                      <ul className="space-y-2">
                        {paymentMethods.map((method: string) => (
                          <li key={method} className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-success">check</span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant capitalize">
                              {method.replace(/_/g, " ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{t("sup.storefront.no_payment_methods")}</p>
                    )}
                  </div>

                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-2">
                      {t("sup.storefront.lead_time")}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {products.some(p => p.leadTimeDays) 
                        ? t("sup.storefront.varies_by_product")
                        : t("sup.storefront.contact_lead_times")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-surface-base border border-outline-variant rounded-lg p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[20px] text-primary">visibility</span>
                  <h3 className="font-label-md text-label-md text-ink-deep">{t("sup.storefront.preview_note")}</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {t("sup.storefront.preview_note_body")}
                </p>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-surface-base border border-outline-variant rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low">
                  <h2 className="font-headline-md text-headline-md text-ink-deep">{t("sup.storefront.listings_title")}</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {t("sup.storefront.listings_body")}
                  </p>
                </div>

                {products.length === 0 ? (
                  <div className="p-12 text-center">
                    <span className="material-symbols-outlined text-[48px] text-on-surface-variant/20 mb-4 block">
                      inventory_2
                    </span>
                    <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                      {t("sup.storefront.no_listings")}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mx-auto">
                      {t("sup.storefront.no_listings_body")}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/30">
                    {products.map(product => (
                      <div key={product.id} className="p-6 hover:bg-surface-container-low/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-body-lg text-body-lg text-ink-deep font-medium truncate">
                                {product.name}
                              </h3>
                              <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
                            </div>
                            <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                              {product.genericName} {product.packSize && `· ${product.packSize}`}
                            </p>
                            <div className="flex items-center gap-3 text-xs font-label-md">
                              <span className="text-on-surface-variant">{product.category}</span>
                              <span className="text-outline-variant">·</span>
                              <span className="text-on-surface-variant">{t("sup.storefront.min_order").replace("{n}", String(product.minOrderQty))}</span>
                              {product.leadTimeDays && (
                                <>
                                  <span className="text-outline-variant">·</span>
                                  <span className="text-on-surface-variant">{t("sup.storefront.lead", String(product.leadTimeDays)).replace("{n}", String(product.leadTimeDays))}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-headline-md text-headline-md text-primary">
                              {product.currency} {product.unitPrice.toLocaleString()}
                            </p>
                            <p className={`font-label-md text-label-md mt-1 ${
                              product.stockAvailable > 0 ? "text-success" : "text-error"
                            }`}>
                              {product.stockAvailable > 0
                                ? t("sup.storefront.in_stock", String(product.stockAvailable)).replace("{n}", String(product.stockAvailable))
                                : t("sup.storefront.out_of_stock")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
