/**
 * @file hq/HQOverviewInner.tsx
 * @description Server component — HQ Console overview panel.
 * Rendered by `app/hq/page.tsx` when a valid `hq_sess` cookie is present.
 * Provides nav cards to Accounts, Quotes, Network, Downloads, and Support sub-sections.
 */
import Link from "next/link";
import HQSidebarServer from "@/components/HQSidebarServer";

export default function HQOverviewInner() {
  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <HQSidebarServer />
      <main className="flex-1 ml-64 p-8 pt-12">
        <div className="max-w-6xl">
          <div className="mb-8">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">
              HQ Console
            </p>
            <h1 className="font-headline-lg text-headline-lg text-ink-deep">Overview</h1>
          </div>

          {/* Quick nav cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              { label: "Intelligence",   href: "/hq/intelligence", icon: "insights",      desc: "Analytics, demographics, and live network activity." },
              { label: "Accounts",       href: "/hq/accounts",     icon: "group",         desc: "View and manage all pharmacy and supplier accounts." },
              { label: "Quote Requests", href: "/hq/quotes",       icon: "request_quote", desc: "Review inbound supplier quote requests." },
              { label: "Network Map",    href: "/hq/network",      icon: "public",        desc: "Visualise the live pharmacy network." },
              { label: "Downloads",      href: "/hq/downloads",    icon: "download",      desc: "Manage desktop app releases for all platforms." },
              { label: "Support",        href: "/hq/support",      icon: "support_agent", desc: "Review and respond to support tickets from users." },
              { label: "HQ Team",        href: "/hq/team",         icon: "badge",         desc: "Manage HQ console operators and access." },
              { label: "News",           href: "/hq/news",          icon: "newspaper",     desc: "Publish and manage news articles for users and the public." },
            ].map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="bg-surface-base border border-outline-variant p-6 custom-notch-sm hover:border-primary/40 hover:shadow-[0_2px_8px_rgba(16,57,185,0.06)] transition-all group"
              >
                <span className="material-symbols-outlined text-[28px] text-primary mb-3 block">
                  {c.icon}
                </span>
                <h2 className="font-headline-md text-headline-md text-ink-deep mb-1">{c.label}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{c.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-primary font-label-md text-label-md group-hover:gap-2 transition-all">
                  Open <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="bg-surface-base border border-outline-variant p-6 rounded">
            <p className="font-label-md text-label-md text-on-surface-variant text-xs uppercase tracking-wider mb-3">
              Session
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              You are authenticated for 8 hours. Cookie-based session — no Supabase user required.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
