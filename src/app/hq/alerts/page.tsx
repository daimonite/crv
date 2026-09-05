import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import HQSidebarServer from "@/components/HQSidebarServer";
import { getHQAlerts, type HQAlert } from "@/lib/actions/hq";
import { HQ_COOKIE_NAME, isValidHQToken } from "@/lib/hq-auth";

export default async function HQAlertsPage() {
  const cookieStore = await cookies();
  if (!isValidHQToken(cookieStore.get(HQ_COOKIE_NAME)?.value)) redirect("/hq");

  const { data: alerts, error } = await getHQAlerts();

  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");

  const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
    critical: { bg: "bg-red-50", border: "border-red-300", icon: "error", label: "Critical" },
    warning: { bg: "bg-amber-50", border: "border-amber-300", icon: "warning", label: "Warning" },
    info: { bg: "bg-blue-50", border: "border-blue-300", icon: "info", label: "Info" },
  };

  const CATEGORY_ICONS: Record<string, string> = {
    expiry: "schedule",
    stock: "inventory_2",
    sync: "sync",
    billing: "payments",
    account: "group",
    support: "support_agent",
  };

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Alerts & Notifications</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Critical events across your pharmacy network requiring attention.
            </p>
          </div>

          {error && (
            <div className="bg-error-container text-on-error-container p-6 rounded mb-8">
              <p className="font-body-md">Failed to load alerts: {error}</p>
            </div>
          )}

          {alerts.length === 0 && !error && (
            <div className="bg-surface-base border border-outline-variant rounded-xl p-16 text-center">
              <span className="material-symbols-outlined text-6xl text-secondary mb-4">verified</span>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-2">All Clear</h2>
              <p className="font-body-md text-on-surface-variant">No active alerts. Your network is running smoothly.</p>
            </div>
          )}

          {critical.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-red-500">error</span>
                <h2 className="font-label-lg text-label-lg text-red-600 uppercase tracking-wider">
                  Critical — {critical.length} alert{critical.length > 1 ? "s" : ""}
                </h2>
              </div>
              <div className="space-y-3">
                {critical.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </section>
          )}

          {warnings.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                <h2 className="font-label-lg text-label-lg text-amber-600 uppercase tracking-wider">
                  Warnings — {warnings.length}
                </h2>
              </div>
              <div className="space-y-3">
                {warnings.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </section>
          )}

          {infos.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-blue-500">info</span>
                <h2 className="font-label-lg text-label-lg text-blue-600 uppercase tracking-wider">
                  Informational — {infos.length}
                </h2>
              </div>
              <div className="space-y-3">
                {infos.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function AlertCard({ alert }: { alert: HQAlert }) {
  const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "error" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "warning" },
    info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "info" },
  };

  const CATEGORY_ICONS: Record<string, string> = {
    expiry: "schedule",
    stock: "inventory_2",
    sync: "sync",
    billing: "payments",
    account: "group",
    support: "support_agent",
  };

  const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;

  return (
    <Link
      href={alert.route}
      className={`flex items-center gap-4 p-5 rounded-xl border ${style.bg} ${style.border} hover:opacity-80 transition-opacity block`}
    >
      <span className={`material-symbols-outlined text-2xl ${style.text}`}>
        {CATEGORY_ICONS[alert.category] ?? "info"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className={`font-label-md text-label-md font-semibold ${style.text}`}>{alert.title}</span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${style.bg} ${style.text} border-current`}>
            {alert.count}
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{alert.description}</p>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
    </Link>
  );
}
