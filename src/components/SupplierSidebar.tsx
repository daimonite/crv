/**
 * @file components/SupplierSidebar.tsx
 * @description Fixed left navigation sidebar for the supplier portal (/supplier/*).
 *
 * Features:
 *  - Active route highlighting via `usePathname()`
 *  - EN/SW language toggle (persisted via LanguageProvider)
 *  - Sign out button (clears Supabase session, redirects to /auth)
 *  - Custom account logo: when `logoUrl` is provided, shows the supplier's
 *    company logo in the sidebar header instead of the generic "Cervos" text.
 *    Populated after onboarding completes; falls back to wordmark.
 *
 * @param accountName - Displayed in the footer as the signed-in account. Optional.
 * @param logoUrl     - Supabase Storage URL of the account's custom logo. Optional.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";

interface SupplierSidebarProps {
  accountName?: string;
  /** Custom account logo URL from Supabase Storage. Falls back to Cervos wordmark. */
  logoUrl?: string;
}

export default function SupplierSidebar({ accountName, logoUrl }: SupplierSidebarProps) {
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
    { labelKey: "portal.dashboard",   href: "/supplier",              icon: "dashboard" },
    { labelKey: "sup.catalog",        href: "/supplier/catalog",      icon: "inventory_2" },
    { labelKey: "sup.orders",         href: "/supplier/orders",        icon: "receipt_long" },
    { labelKey: "sup.alerts",         href: "/supplier/alerts",        icon: "notifications_active" },
    { labelKey: "sup.analytics",      href: "/supplier/analytics",    icon: "monitoring" },
    { labelKey: "sup.storefront",     href: "/supplier/storefront",    icon: "storefront" },
    { labelKey: "sup.connections",    href: "/supplier/connections",  icon: "hub" },
    { labelKey: "sup.subscription",   href: "/supplier/subscription", icon: "workspace_premium" },
    { labelKey: "sup.activity",       href: "/supplier/activity",      icon: "history" },
    { labelKey: "portal.settings",    href: "/supplier/settings",      icon: "settings" },
  ];

  return (
    <nav className="hidden md:flex flex-col w-64 z-40 fixed left-0 top-0 bottom-0 border-r border-outline-variant bg-surface h-full overflow-hidden">

      {/* Brand / account logo */}
      <div className="p-6 border-b border-outline-variant">
        {logoUrl ? (
          /* Custom supplier logo — set during onboarding */
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 relative flex-shrink-0 rounded overflow-hidden border border-outline-variant/40">
              <Image
                src={logoUrl}
                alt={accountName ?? "Supplier"}
                fill
                sizes="36px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight truncate text-sm leading-tight">
                {accountName ?? t("sidebar.supplier")}
              </p>
              <p className="font-label-md text-label-md text-on-surface-variant mt-0.5 uppercase tracking-wider text-[10px]">
                {t("sidebar.supplier_portal")}
              </p>
            </div>
          </div>
        ) : (
          /* Default Cervos branding */
          <>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">Cervos</h1>
            <p className="font-label-md text-label-md text-on-surface-variant mt-1 uppercase tracking-wider">{t("sidebar.supplier_portal")}</p>
          </>
        )}
      </div>

      {/* New Quote CTA */}
      <div className="px-4 py-4 border-b border-outline-variant">
        <Link
          href="/supplier/quote"
          className="w-full bg-ink-deep text-white font-label-md text-label-md py-3 flex justify-center items-center gap-2 hover:opacity-90 transition-opacity rounded"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          {t("sup.quote")}
        </Link>
      </div>

      {/* Nav — scrolls */}
      <ul className="flex-1 py-3 overflow-y-auto min-h-0 scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-outline-variant [&::-webkit-scrollbar-thumb]:rounded-full">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/supplier" && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 font-label-md text-label-md transition-all ${
                  active
                    ? "text-primary border-r-2 border-primary bg-surface-container-low font-bold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer — pinned */}
      <div className="border-t border-outline-variant py-3 shrink-0 bg-surface">
        {accountName && (
          <div className="px-6 py-2 mb-2">
            <p className="text-label-md font-label-md text-on-surface-variant text-xs">{t("sidebar.signed_in_as")}</p>
            <p className="text-body-sm font-medium text-on-surface truncate">{accountName}</p>
          </div>
        )}
        {/* Lang toggle */}
        <div className="flex items-center gap-2 px-6 py-2 mb-1">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">translate</span>
          <div className="flex gap-1 bg-surface-container rounded p-0.5">
            {(["EN", "SW"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2 py-0.5 text-xs font-label-md rounded transition-colors ${
                  lang === l ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <ul>
          <li>
            <Link
              href="/support"
              className="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-all font-label-md text-label-md"
            >
              <span className="material-symbols-outlined text-[18px]">contact_support</span>
              {t("sup.support")}
            </Link>
          </li>
          <li>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-all font-label-md text-label-md w-full text-left"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              {t("portal.logout")}
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
