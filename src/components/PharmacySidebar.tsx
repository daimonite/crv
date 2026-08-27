/**
 * @file components/PharmacySidebar.tsx
 * @description Fixed left navigation sidebar for the pharmacy portal (/dashboard/*).
 *
 * Features:
 *  - Active route highlighting via `usePathname()`
 *  - EN/SW language toggle (persisted via LanguageProvider)
 *  - Sign out button (clears Supabase session, redirects to /auth)
 *  - Custom account logo: when `logoUrl` is provided, replaces the Cervos
 *    wordmark with the pharmacy's own branding in the sidebar header.
 *    Falls back to Cervos logo + "Pharmacy OS" if no logo set.
 *
 * @param accountName  - Displayed in the footer as the signed-in account. Optional.
 * @param branchName   - Active branch name shown in a chip below the logo. Optional.
 * @param logoUrl      - Supabase Storage URL of the account's custom logo. Optional.
 *                       Populated after onboarding completes. Falls back to Cervos logo.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";

interface PharmacySidebarProps {
  branchName?: string;
  accountName?: string;
  /** Custom account logo URL from Supabase Storage. Falls back to Cervos logo. */
  logoUrl?: string;
}

export default function PharmacySidebar({ branchName, accountName, logoUrl }: PharmacySidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useI18n();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  const NAV = [
    { labelKey: "portal.dashboard",   href: "/dashboard",             icon: "dashboard" },
    { labelKey: "portal.alerts",      href: "/dashboard/alerts",      icon: "notifications" },
    { labelKey: "portal.inventory",   href: "/dashboard/inventory",   icon: "inventory_2" },
    { labelKey: "portal.marketplace", href: "/dashboard/marketplace", icon: "storefront" },
    { labelKey: "portal.operators",  href: "/dashboard/operators",   icon: "group" },
    { labelKey: "portal.orders",     href: "/dashboard/orders",      icon: "shopping_cart" },
    { labelKey: "portal.branches",    href: "/dashboard/branches",    icon: "storefront" },
    { labelKey: "portal.reports",    href: "/dashboard/reports",    icon: "analytics" },
    { labelKey: "portal.billing",    href: "/dashboard/billing",     icon: "payments" },
    { labelKey: "portal.settings",   href: "/dashboard/settings",    icon: "settings" },
  ];

  return (
    <aside className="bg-surface fixed left-0 top-0 h-full w-64 border-r border-outline-variant flex flex-col py-6 z-20">
      {/* Brand / account logo */}
      <div className="px-6 mb-8 flex items-center gap-2">
        {logoUrl ? (
          /* Custom pharmacy logo — set during onboarding */
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 relative flex-shrink-0 rounded overflow-hidden border border-outline-variant/40">
              <Image
                src={logoUrl}
                alt={accountName ?? "Pharmacy"}
                fill
                sizes="32px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <span className="font-headline-md font-bold text-on-surface block leading-none truncate text-sm">
                {accountName ?? t("sidebar.pharmacy")}
              </span>
              <span className="font-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">
                {t("sidebar.pharmacy_os")}
              </span>
            </div>
          </div>
        ) : (
          /* Default Cervos branding */
          <>
            <div className="w-6 h-6 relative flex-shrink-0">
              <Image
                src="/logo.png"
                alt="Cervos"
                fill
                sizes="24px"
                className="object-contain"
                style={{ mixBlendMode: "multiply" }}
              />
            </div>
            <div>
              <span className="font-headline-md font-bold text-on-surface block leading-none">Cervos</span>
              <span className="font-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Pharmacy OS</span>
            </div>
          </>
        )}
      </div>

      {/* Branch chip */}
      {branchName && (
        <div className="mx-4 mb-5 px-3 py-2 bg-surface-container rounded border border-outline-variant">
          <p className="font-label-md text-on-surface-variant uppercase tracking-wider mb-0.5 text-[10px]">{t("portal.branch")}</p>
          <p className="font-body-md font-medium text-on-surface truncate text-sm">{branchName}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3">
        {NAV.map(item => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors border-l-2 ${
                active
                  ? "text-primary font-bold bg-primary/8 border-primary"
                  : "text-on-surface-variant hover:bg-surface-container border-transparent"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              <span className="font-body-md text-sm">{t(item.labelKey)}</span>
            </Link>
          );
        })}
        {/* Download — no lock icon; any pharmacy user can access */}
        <Link
          href="/download"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors border-l-2 mt-1 ${
            pathname === "/download"
              ? "text-primary font-bold bg-primary/8 border-primary"
              : "text-on-surface-variant hover:bg-surface-container border-transparent"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          <span className="font-body-md text-sm">{t("portal.download")}</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="px-3 mt-auto flex flex-col border-t border-outline-variant pt-3">
        {accountName && (
          <div className="px-3 py-2 mb-1">
            <p className="text-[10px] font-label-md text-on-surface-variant uppercase tracking-wider">{t("sidebar.signed_in_as")}</p>
            <p className="text-sm font-medium text-on-surface truncate">{accountName}</p>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">translate</span>
          <div className="flex gap-0.5 bg-surface-container rounded p-0.5">
            {(["EN", "SW"] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-0.5 text-[11px] font-label-md rounded transition-colors ${
                  lang === l ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 text-error hover:bg-error-container transition-colors w-full text-left rounded-md"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          <span className="font-body-md text-sm">{t("portal.logout")}</span>
        </button>
      </div>
    </aside>
  );
}
