/**
 * @route /supplier/orders
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @data Live Supabase data via getSupplierOrders() — no mock rows.
 * @renders SupplierOrdersTable — filterable orders with live status tracking.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscribedActive } from "@/lib/subscription";
import SupplierSidebar from "@/components/SupplierSidebar";
import SupplierOrdersTable, { type SupplierOrder } from "@/components/SupplierOrdersTable";
import { getSupplierOrders } from "@/lib/actions/supplier";
import { getT } from "@/lib/i18n/server";

export default async function SupplierOrdersPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/orders");

  const { data: account } = await supabase
    .from("accounts")
    .select("name, type, subscription_status, subscription_expires_at, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  // Enforce supplier-only access
  if (account?.type !== "supplier") redirect("/dashboard");

  // Subscription paywall: orders are gated behind an active supplier plan.
  if (!isSubscribedActive(account)) redirect("/supplier/subscription");

  const orders = await getSupplierOrders();
  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center justify-between px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.orders.inbound_orders")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("sup.orders.title")}</h1>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
              <span className="font-mono text-label-md text-amber-600 uppercase">
                {t("sup.orders.awaiting", String(pendingCount)).replace("{n}", String(pendingCount))}
              </span>
            </div>
          )}
        </header>
        <div className="pt-16 flex-1 flex">
          <SupplierOrdersTable orders={orders as SupplierOrder[]} />
        </div>
      </div>
    </div>
  );
}
