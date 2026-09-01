/**
 * @route /supplier/connections
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @description Send branch connection requests and track their approval status.
 *         A branch's POS Admin must approve before that branch can order from
 *         this supplier (browsing the catalog itself stays open regardless).
 * @note "sup.connections" nav label is in src/lib/i18n/translations.ts (EN/SW).
 *       The page eyebrow/title strings below aren't — they fall back to their
 *       English default via t(key, fallback) rather than breaking.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SupplierSidebar from "@/components/SupplierSidebar";
import SupplierConnectionsClient from "@/components/SupplierConnectionsClient";
import { getT } from "@/lib/i18n/server";

export default async function SupplierConnectionsPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/connections");

  const { data: account } = await supabase
    .from("accounts")
    .select("name, type")
    .eq("auth_user_id", user.id)
    .single();

  if (account?.type !== "supplier") redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.connections.eyebrow", "Branch Connections")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">
              {t("sup.connections.title", "Connection Requests")}
            </h1>
          </div>
        </header>
        <div className="pt-16 flex-1">
          <SupplierConnectionsClient />
        </div>
      </div>
    </div>
  );
}
