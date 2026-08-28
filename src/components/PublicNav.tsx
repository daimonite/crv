/**
 * @file components/PublicNav.tsx
 * @description Fixed top navigation bar for all public-facing pages (landing, news, etc.).
 *
 * Features:
 *  - Scroll shadow on scroll past 8px
 *  - Mobile hamburger menu with full-screen drawer
 *  - EN/SW language toggle (persisted via LanguageProvider)
 *  - Logo with `mixBlendMode: "multiply"` to remove white background on light surfaces
 *  - "Suppliers" link points to /supplier/quote (public lead-gen form)
 *
 * @param activePath - Optional path string to highlight the active nav link
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n/context";

export default function PublicNav({ activePath = "" }: { activePath?: string }) {
  const { lang, setLang, t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const NAV_LINKS = [
    { key: "nav.platform",  href: "/#features" },
    { key: "nav.suppliers", href: "/supplier/quote" },
    { key: "nav.news",      href: "/news" },
    { key: "nav.support",    href: "/support" },
    { key: "nav.download",  href: "/download" },
  ];

  return (
    <nav className={`bg-surface-base/90 backdrop-blur-md fixed top-0 w-full z-50 border-b transition-shadow duration-200 ${scrolled ? "shadow-sm border-outline-variant/20" : "border-transparent"}`}>
      <div className="flex justify-between items-center w-full px-6 md:px-8 py-3.5 max-w-container-max mx-auto">
        {/* Logo — mix-blend-mode removes white background on light surfaces */}
        <Link href="/" className="flex items-center gap-2 font-headline-md font-bold tracking-tight text-primary">
          <div className="w-7 h-7 relative flex-shrink-0">
            <Image
              src="/logo.png"
              alt="Cervos"
              fill
              sizes="28px"
              className="object-contain"
              style={{ mixBlendMode: "multiply" }}
            />
          </div>
          CERVOS
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-0.5">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-label-md text-label-md px-3 py-2 rounded transition-colors hover:text-primary hover:bg-primary/5 ${activePath === link.href ? "text-primary font-bold" : "text-on-surface-variant"}`}
            >
              {t(link.key)}
            </Link>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* EN/SW */}
          <div className="flex bg-primary/8 rounded p-0.5 border border-primary/15">
            {(["EN", "SW"] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 text-xs font-label-md rounded transition-all ${lang === l ? "text-on-primary bg-primary shadow-sm" : "text-primary hover:bg-primary/10"}`}
              >
                {l}
              </button>
            ))}
          </div>

          <Link href="/auth" className="hidden md:block text-on-surface-variant font-label-md text-label-md hover:text-primary transition-colors px-2">
            {t("nav.login")}
          </Link>

          <Link
            href="/auth?tab=signup&type=pharmacy"
            className="bg-primary text-on-primary font-label-md text-label-md px-5 py-2 rounded hover:bg-primary/90 active:scale-[0.98] transition-all gaming-snap text-sm"
          >
            {t("nav.getstarted")}
          </Link>

          {/* Hamburger */}
          <button className="md:hidden text-on-surface-variant hover:text-on-surface" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            <span className="material-symbols-outlined text-[24px]">{menuOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden border-t border-outline-variant/20 bg-surface-base/97 backdrop-blur-md px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="font-body-md py-3 text-on-surface-variant hover:text-primary border-b border-outline-variant/10 last:border-0">
              {t(link.key)}
            </Link>
          ))}
          <div className="flex gap-3 pt-3">
            <Link href="/auth" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2.5 border border-outline-variant font-label-md text-label-md text-on-surface-variant hover:border-primary rounded">
              {t("nav.login")}
            </Link>
            <Link href="/auth?tab=signup&type=pharmacy" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2.5 bg-primary text-on-primary font-label-md text-label-md rounded">
              {t("nav.getstarted")}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
