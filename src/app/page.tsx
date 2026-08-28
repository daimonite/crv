"use client";

import Image from "next/image";
import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import MapClientWrapper from "@/components/MapClientWrapper";
import { useI18n } from "@/lib/i18n/context";

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="bg-surface-base text-on-surface font-body-md antialiased">
      <PublicNav />

      {/* ── Hero ── */}
      <section className="relative w-full min-h-[90vh] flex items-center pt-24 pb-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/pharmacist-1.png"
            alt="East African pharmacist using Cervos"
            fill
            sizes="100vw"
            className="object-cover saturate-90"
            priority
          />
          <div className="absolute inset-0 bg-surface-base/60" />
        </div>

        <div className="relative z-10 max-w-container-max mx-auto px-8 w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 flex flex-col justify-center">
            <span className="text-primary font-label-md text-label-md uppercase tracking-wider mb-4 block">
              {t("hero.tagline")}
            </span>
            <h1 className="font-headline-xl font-bold text-ink-deep hero-headline mb-6">
              {t("hero.headline")}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mb-10">
              {t("hero.body")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/auth?tab=signup&type=pharmacy"
                className="bg-primary text-on-primary font-label-md text-label-md px-8 py-4 rounded hover:scale-[1.02] active:scale-[0.98] transition-transform gaming-snap flex items-center justify-center gap-2"
              >
                {t("hero.cta.start")}
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
              <Link
                href="/supplier/quote"
                className="border border-outline text-on-surface-variant font-label-md text-label-md px-8 py-4 rounded hover:bg-surface-container/50 active:scale-[0.98] transition-all gaming-snap flex items-center justify-center"
              >
                {t("hero.cta.supplier")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="py-16 bg-surface-base border-y border-outline-variant/20" id="features">
        <div className="max-w-container-max mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { value: "1,200+", labelKey: "stats.pharmacies" },
              { value: "99.9%",  labelKey: "stats.uptime" },
              { value: "5M+",    labelKey: "stats.transactions" },
            ].map((stat) => (
              <div
                key={stat.labelKey}
                className="p-8 bg-surface-muted custom-notch border border-outline-variant/20 text-center hover:border-primary/30 transition-colors"
              >
                <div className="font-headline-xl text-headline-xl text-primary mb-2">{stat.value}</div>
                <div className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">
                  {t(stat.labelKey)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core features ── */}
      <section className="py-24 bg-surface-muted relative overflow-hidden">
        <div className="max-w-container-max mx-auto px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-4">{t("features.title")}</h2>
            <p className="font-body-md text-on-surface-variant max-w-2xl mx-auto">{t("features.body")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: "inventory_2", titleKey: "feat.inventory.title", bodyKey: "feat.inventory.body" },
              { icon: "smartphone",  titleKey: "feat.offline.title",   bodyKey: "feat.offline.body" },
              { icon: "lock",        titleKey: "feat.escrow.title",    bodyKey: "feat.escrow.body" },
            ].map((f) => (
              <div
                key={f.titleKey}
                className="bg-surface-base border border-outline-variant/20 custom-notch p-8 relative group hover:shadow-[0_4px_12px_rgba(52,84,209,0.05)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center mb-6 text-primary">
                  <span className="material-symbols-outlined text-[24px]">{f.icon}</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-ink-deep mb-3">{t(f.titleKey)}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{t(f.bodyKey)}</p>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300 ease-out" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEFO deep-dive ── */}
      <section className="py-32 bg-surface-base relative overflow-hidden">
        <div className="max-w-container-max mx-auto px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-32">
            <div className="flex flex-col gap-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary font-label-md text-label-md rounded-full w-fit">
                <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                {t("landing.fefo.protocol")}
              </div>
              <h2 className="font-headline-xl text-headline-xl text-ink-deep">{t("landing.fefo.title")}</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                Our proprietary inventory algorithms strictly enforce First-Expired-First-Out dispensing logic —
                a hardcoded operational mandate that reduces stock write-offs and guarantees patient safety.
              </p>
              <ul className="space-y-4 mt-4">
                {[
                  { titleKey: "landing.fefo.automated", body: "System flags items nearing expiry automatically." },
                  { titleKey: "landing.fefo.smart",     body: "POS interfaces visually prioritise the correct batch for the pharmacist." },
                ].map((item) => (
                  <li key={item.titleKey} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary mt-0.5">check_circle</span>
                    <div>
                      <h4 className="font-headline-md text-lg text-ink-deep">{t(item.titleKey)}</h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/auth?tab=signup&type=pharmacy"
                className="mt-2 w-fit inline-flex items-center gap-2 bg-primary text-on-primary font-label-md text-label-md px-6 py-3 rounded hover:scale-[1.02] active:scale-[0.98] transition-transform gaming-snap"
              >
                {t("hero.cta.start")}
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
            </div>
            <div className="bg-surface-muted p-8 border border-outline-variant/20 shadow-lg custom-notch">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-outline-variant/20">
                  <span className="font-headline-md text-lg text-ink-deep">Amoxicillin 500mg</span>
                  <span className="font-label-md text-label-md text-primary uppercase tracking-wider">{t("landing.fefo.grid")}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm font-label-md text-label-md text-on-surface-variant uppercase pb-2">
                  <span>{t("inv.col.batch")}</span><span>{t("inv.col.qty")}</span><span>{t("inv.col.expiry")}</span><span>{t("inv.col.status")}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 bg-error-container/30 border border-error/20 p-3 rounded items-center">
                  <span className="font-mono text-sm text-ink-deep">BX-992A</span>
                  <span>45</span>
                  <span className="text-error font-bold">2 Days</span>
                  <span className="bg-error text-on-error px-2 py-1 rounded text-xs text-center">{t("landing.fefo.status.first")}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 bg-surface-base p-3 rounded items-center border border-outline-variant/20">
                  <span className="font-mono text-sm text-ink-deep">BX-104C</span>
                  <span>120</span>
                  <span>14 Mo</span>
                  <span className="text-outline text-xs text-center">{t("landing.fefo.status.queued")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Map section ── */}
      <section className="py-16 bg-surface-muted border-t border-outline-variant/20">
        <div className="max-w-container-max mx-auto px-8">
          <div className="text-center mb-10">
            <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-3">{t("map.title")}</h2>
            <p className="font-body-md text-on-surface-variant">{t("map.body")}</p>
          </div>
          <div className="custom-notch border border-outline-variant/20 overflow-hidden h-[400px]">
            <MapClientWrapper
              center={[-6.816, 39.2803]}
              zoom={11}
              markers={[
                { lat: -6.816,  lng: 39.2803, label: "Kariakoo Branch", status: "online" },
                { lat: -6.8,    lng: 39.2833, label: "Upanga Branch",   status: "online" },
                { lat: -6.7667, lng: 39.25,   label: "Mikocheni Branch",status: "grace" },
              ]}
              className="h-[400px] w-full"
            />
          </div>
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className="py-24 bg-surface-base relative overflow-hidden">
        <div className="max-w-container-max mx-auto px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative custom-notch overflow-hidden border border-outline-variant/20 p-2 h-[500px]">
              <Image src="/pharmacist-2.png" alt="Confident East African pharmacist" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover saturate-90" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="material-symbols-outlined text-[48px] text-primary/20 mb-6 block" style={{ fontVariationSettings: '"FILL" 1' }}>format_quote</span>
              <h3 className="font-headline-lg text-headline-lg text-ink-deep mb-8 leading-tight">{t("quote.text")}</h3>
              <div className="flex items-center gap-4 border-t border-outline-variant/20 pt-6">
                <div className="w-12 h-12 bg-surface-container rounded-full flex items-center justify-center text-primary font-headline-md text-headline-md">DA</div>
                <div>
                  <p className="font-label-md text-label-md text-ink-deep uppercase">{t("quote.name")}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{t("quote.title")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-surface-muted border-t border-outline-variant/20">
        <div className="max-w-3xl mx-auto px-8">
          <h2 className="font-headline-lg text-headline-lg text-ink-deep mb-12 text-center">{t("faq.title")}</h2>
          <div className="space-y-4">
            {(["1", "2", "3"] as const).map((n) => (
              <details
                key={n}
                className="group bg-surface-base border border-outline-variant/20 rounded p-6 [&_summary::-webkit-details-marker]:hidden cursor-pointer shadow-sm hover:border-primary/50 transition-colors"
              >
                <summary className="flex justify-between items-center font-headline-md text-lg text-ink-deep select-none">
                  {t(`faq.${n}.q`)}
                  <span className="material-symbols-outlined group-open:rotate-180 transition-transform text-outline">expand_more</span>
                </summary>
                <p className="mt-4 font-body-md text-body-md text-on-surface-variant pt-4 border-t border-outline-variant/20">{t(`faq.${n}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="py-20 bg-primary text-on-primary text-center">
        <div className="max-w-2xl mx-auto px-8">
          <h2 className="font-headline-lg text-headline-lg mb-4">{t("landing.cta.ready")}</h2>
          <p className="font-body-lg text-body-lg text-on-primary/80 mb-8">{t("landing.cta.join")}</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/auth?tab=signup&type=pharmacy" className="bg-white text-primary font-label-md text-label-md px-8 py-4 rounded hover:scale-[1.02] active:scale-[0.98] transition-transform gaming-snap">
              {t("hero.cta.start")}
            </Link>
            <Link href="/supplier/quote" className="border border-white/30 text-on-primary font-label-md text-label-md px-8 py-4 rounded hover:bg-white/10 transition-colors">
              {t("hero.cta.supplier")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-ink-deep w-full">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 px-8 py-16 max-w-container-max mx-auto">
          <div className="col-span-1 flex flex-col gap-4">
            <span className="font-headline-md text-headline-md font-black text-on-primary tracking-tight">CERVOS</span>
            <p className="font-body-sm text-body-sm text-surface-variant/70 mt-2">Pharmacy OS</p>
            <p className="font-body-sm text-body-sm text-surface-variant/70">hq@cervos.online<br />+255 723 202 610</p>
          </div>
          <div className="col-span-1 md:col-span-3 flex flex-wrap gap-x-8 gap-y-4 md:justify-end items-start pt-2">
            {[
              { labelKey: "landing.footer.platform",  href: "/#features" },
              { labelKey: "landing.footer.suppliers",  href: "/supplier/quote" },
              { labelKey: "landing.footer.news",      href: "/news" },
              { labelKey: "landing.footer.download",  href: "/download" },
              { labelKey: "landing.footer.support",   href: "/support" },
              { labelKey: "footer.terms",             href: "/terms" },
              { labelKey: "footer.privacy",            href: "/privacy" },
            ].map((l) => (
              <Link key={l.labelKey} href={l.href} className="font-body-sm text-body-sm text-surface-variant/70 hover:text-surface-bright transition-colors">
                {t(l.labelKey)}
              </Link>
            ))}
          </div>
        </div>
        <div className="border-t border-surface-variant/10 px-8 py-4 max-w-container-max mx-auto">
          <p className="font-body-sm text-body-sm text-surface-variant/40">© {new Date().getFullYear()} Cervos. {t("footer.rights")}</p>
        </div>
      </footer>
    </div>
  );
}
