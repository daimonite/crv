/**
 * @route /supplier/activity
 * @access Authenticated supplier accounts only.
 *         Pharmacy accounts are redirected to /dashboard.
 * @description Shows recent activity log entries for the supplier's account.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscribedActive } from "@/lib/subscription";
import SupplierSidebar from "@/components/SupplierSidebar";
import { getT } from "@/lib/i18n/server";

interface ActivityEntry {
  id: string;
  action: string;
  actor: string | null;
  entity_type: string | null;
  detail: string | null;
  created_at: string;
}

export default async function SupplierActivityPage() {
  const t = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/supplier/activity");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, subscription_status, subscription_expires_at, trial_ends_at")
    .eq("auth_user_id", user.id)
    .single();

  if (account?.type !== "supplier") redirect("/dashboard");

  // Subscription paywall: activity history is part of the supplier plan.
  if (!isSubscribedActive(account)) redirect("/supplier/subscription");

  const { data: activityData } = await supabase
    .from("activity_log")
    .select("id, action, actor, entity_type, detail, created_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const activities: ActivityEntry[] = (activityData ?? []).map(row => ({
    id: row.id,
    action: row.action,
    actor: row.actor,
    entity_type: row.entity_type,
    detail: row.detail ? (typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail)) : null,
    created_at: row.created_at,
  }));

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t("sup.activity.just_now");
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const getActionIcon = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes("create") || actionLower.includes("add") || actionLower.includes("insert")) {
      return { icon: "add_circle", color: "text-success" };
    }
    if (actionLower.includes("update") || actionLower.includes("edit") || actionLower.includes("change")) {
      return { icon: "edit", color: "text-primary" };
    }
    if (actionLower.includes("delete") || actionLower.includes("remove") || actionLower.includes("archive")) {
      return { icon: "delete", color: "text-error" };
    }
    if (actionLower.includes("order") || actionLower.includes("purchase")) {
      return { icon: "shopping_cart", color: "text-secondary" };
    }
    if (actionLower.includes("login") || actionLower.includes("signin")) {
      return { icon: "login", color: "text-on-surface-variant" };
    }
    if (actionLower.includes("logout") || actionLower.includes("signout")) {
      return { icon: "logout", color: "text-on-surface-variant" };
    }
    if (actionLower.includes("quote") || actionLower.includes("request")) {
      return { icon: "request_quote", color: "text-amber-600" };
    }
    return { icon: "circle", color: "text-on-surface-variant" };
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <SupplierSidebar accountName={account?.name} />
      <div className="ml-64 flex-1 flex flex-col">
        <header className="bg-surface fixed top-0 right-0 h-16 border-b border-outline-variant flex items-center px-8 w-[calc(100%-16rem)] z-10">
          <div>
            <p className="font-mono text-label-md text-on-surface-variant uppercase tracking-widest mb-0.5">
              {t("sup.activity.account_audit")}
            </p>
            <h1 className="font-headline-md text-headline-md text-ink-deep leading-none">{t("sup.activity.title")}</h1>
          </div>
          <div className="ml-auto font-mono text-label-md text-on-surface-variant uppercase">
            {t("sup.activity.recent_events", String(activities.length)).replace("{n}", String(activities.length))}
          </div>
        </header>

        <main className="pt-16 flex-1 px-8 py-8">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <span className="material-symbols-outlined text-[64px] text-on-surface-variant/20 mb-4">history</span>
              <h2 className="font-headline-md text-headline-md text-ink-deep mb-2">{t("sup.activity.no_activity")}</h2>
              <p className="font-body-md text-body-md text-on-surface-variant text-center max-w-sm">
                {t("sup.activity.no_activity_body")}
              </p>
            </div>
          ) : (
            <div className="bg-surface-base border border-outline-variant rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low">
                <h2 className="font-headline-md text-headline-md text-ink-deep">{t("sup.activity.events_title")}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {t("sup.activity.events_body")}
                </p>
              </div>
              <div className="divide-y divide-outline-variant/30">
                {activities.map((activity) => {
                  const { icon, color } = getActionIcon(activity.action);
                  return (
                    <div key={activity.id} className="px-6 py-4 hover:bg-surface-container-low/30 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-container-low mt-0.5`}>
                          <span className={`material-symbols-outlined text-[16px] ${color}`}>
                            {icon}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-body-md text-body-md text-ink-deep font-medium">
                              {activity.action}
                            </p>
                            {activity.entity_type && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-label-md bg-surface-container-low text-on-surface-variant border border-outline-variant/50">
                                {activity.entity_type}
                              </span>
                            )}
                          </div>
                          {activity.detail && (
                            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                              {activity.detail}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {activity.actor && (
                              <span className="font-label-md text-label-md text-on-surface-variant">
                                {t("sup.activity.by_actor").replace("{name}", activity.actor)}
                              </span>
                            )}
                            <span className="font-label-md text-label-md text-on-surface-variant/60">
                              {formatTimestamp(activity.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
