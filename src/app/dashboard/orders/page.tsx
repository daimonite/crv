"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscribedActive } from "@/lib/subscription";
import PharmacySidebar from "@/components/PharmacySidebar";
import OrdersTable from "@/components/OrdersTable";
import { getOrders } from "@/lib/actions/orders";
import { getT } from "@/lib/i18n/server";

export default async function OrdersPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/dashboard/orders");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, subscription_status, subscription_expires_at, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  if (account?.type !== "pharmacy") redirect("/dashboard");

  // Subscription paywall: order history is part of the pharmacy plan.
  if (!isSubscribedActive(account)) redirect("/dashboard/billing");

  const orders = await getOrders(account!.id);

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar branchName={undefined} accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("dash.orders.subtitle")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">
              {t("dash.orders.title")}
            </h1>
          </div>
        </header>
        <div className="pt-16 flex-1">
          <OrdersTable orders={orders} />
        </div>
      </div>
    </div>
  );
}
