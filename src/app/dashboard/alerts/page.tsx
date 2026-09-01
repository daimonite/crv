/**
 * @route /dashboard/alerts
 * @access Authenticated pharmacy accounts only.
 * @description Alerts dashboard for pharmacy users — shows expiring stock, sync issues, subscription warnings.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscribedActive } from "@/lib/subscription";
import { getPharmacyAlerts, getPharmacyNotifications } from "@/lib/actions/pharmacy";
import PharmacySidebar from "@/components/PharmacySidebar";
import AlertsClient from "./AlertsClient";
import { getT } from "@/lib/i18n/server";

export default async function AlertsPage() {
  const t = await getT();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/dashboard/alerts");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, subscription_status, subscription_expires_at, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) redirect("/auth?next=/dashboard/alerts");

  // Notification feed is part of the pharmacy subscription.
  if (!isSubscribedActive(account)) redirect("/dashboard/billing");

  const [{ data: alerts, error }, { data: notifications }] = await Promise.all([
    getPharmacyAlerts(),
    getPharmacyNotifications(),
  ]);

  return (
    <div className="flex min-h-screen bg-surface">
      <PharmacySidebar accountName={account.name} />

      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <h2 className="font-headline-md text-headline-md text-ink-deep">
            {t("portal.alerts")}
          </h2>
        </header>

        <main className="flex-grow pt-24 pb-24 px-8 max-w-container-max mx-auto w-full">
          <div className="mb-8">
            <h1 className="font-headline-lg text-headline-lg text-ink-deep mb-1">
              Alerts & Notifications
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Important events at your branches requiring attention.
            </p>
          </div>

          <AlertsClient alerts={alerts ?? []} error={error} notifications={notifications ?? []} />
        </main>
      </div>
    </div>
  );
}
