/**
 * @file components/HQSidebar.tsx
 * @description Fixed left navigation sidebar for the HQ Console (/hq/*).
 *
 * Highlights the active route using `usePathname()`. No props required —
 * nav items are statically defined (HQ has no per-user customisation).
 * Hidden on mobile (md:flex) — the HQ console is desktop-only.
 *
 * @prop openSupportCount - Optional live count of open support tickets (passed
 *   by HQSidebarServer, which fetches it server-side). Displays a badge on the
 *   Support nav item when > 0.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";

interface HQSidebarProps {
  openSupportCount?: number;
}

export default function HQSidebar({ openSupportCount = 0 }: HQSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const NAV = [
    { label: t("hq.sidebar.overview"),       href: "/hq",                icon: "dashboard" },
    { label: t("hq.sidebar.alerts"),         href: "/hq/alerts",         icon: "notifications" },
    { label: t("hq.sidebar.intelligence"),   href: "/hq/intelligence",   icon: "insights" },
    { label: t("hq.sidebar.accounts"),       href: "/hq/accounts",       icon: "group" },
    { label: t("hq.sidebar.billing"),        href: "/hq/billing",        icon: "payments" },
    { label: t("hq.sidebar.quotes"),         href: "/hq/quotes",         icon: "request_quote" },
    { label: t("hq.sidebar.invites"),        href: "/hq/invites",        icon: "mail" },
    { label: t("hq.sidebar.network"),        href: "/hq/network",        icon: "public" },
    { label: t("hq.sidebar.downloads"),      href: "/hq/downloads",      icon: "download" },
    { label: t("hq.sidebar.support"),        href: "/hq/support",        icon: "support_agent" },
    { label: t("hq.sidebar.team"),           href: "/hq/team",           icon: "badge" },
    { label: t("hq.sidebar.news"),           href: "/hq/news",           icon: "newspaper" },
    { label: t("hq.sidebar.messages"),       href: "/hq/messages",       icon: "campaign" },
    { label: t("hq.sidebar.audit"),          href: "/hq/audit",          icon: "shield" },
  ];

  async function handleLogout() {
    document.cookie = `hq_sess=; Max-Age=0; path=/`;
    router.push("/hq");
  }

  return (
    <aside className="hidden md:flex flex-col w-64 z-40 fixed left-0 top-0 bottom-0 border-r border-outline-variant bg-surface-container-low h-full py-4 overflow-hidden">
      <div className="px-6 mb-3">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-1">
          {t("hq.sidebar.title")}
        </h2>
        <div className="font-mono text-[10px] text-on-surface-variant uppercase">
          {t("hq.sidebar.status")}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto min-h-0 scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-outline-variant [&::-webkit-scrollbar-thumb]:rounded-full py-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/hq" && pathname.startsWith(item.href));
          const isSupport = item.href === "/hq/support";
          const showBadge = isSupport && openSupportCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 transition-all duration-75 ${
                active
                  ? "bg-primary text-on-primary font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              <span className="font-label-md text-label-md flex-1">{item.label}</span>
              {showBadge && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  active
                    ? "bg-on-primary/20 text-on-primary"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {openSupportCount > 99 ? "99+" : openSupportCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="px-2 mt-auto pt-2 border-t border-outline-variant shrink-0 bg-surface-container-low">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all duration-75 rounded-md"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          <span className="font-label-md text-label-md">{t("hq.sidebar.logout")}</span>
        </button>
      </div>
    </aside>
  );
}
