"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PublicNav from "@/components/PublicNav";
import Toast from "@/components/Toast";
import { useI18n } from "@/lib/i18n/context";
import { AppRelease } from "@/lib/actions/hq";
import "leaflet/dist/leaflet.css";

/* ─── types / constants ─────────────────────────────────────────── */

interface DownloadClientProps { releases: Record<string, AppRelease>; }
const OS_TO_PLATFORM: Record<string, string> = { macos: "mac", windows: "windows", linux: "linux" };
function formatBytes(b: number) { if (!b) return "0 B"; const k=1024,s=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(k)); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }

type OS = "macos" | "windows" | "linux";
const OS_ORDER: OS[] = ["windows", "macos", "linux"];
const OS_CONFIG: Record<OS, { labelKey: string; icon: string; reqKey: string; ext: string }> = {
  windows: { labelKey: "download.for.windows", icon: "window",     reqKey: "download.req.windows", ext: ".exe" },
  macos:   { labelKey: "download.for.macos",   icon: "laptop_mac", reqKey: "download.req.macos",   ext: ".dmg" },
  linux:   { labelKey: "download.for.linux",   icon: "terminal",   reqKey: "download.req.linux",   ext: ".deb / .AppImage" },
};

const FEATURES = [
  { icon: "inventory_2",  titleKey: "download.feat1.title",  bodyKey: "download.feat1.body"  },
  { icon: "wifi_off",     titleKey: "download.feat2.title",  bodyKey: "download.feat2.body"  },
  { icon: "storefront",   titleKey: "download.feat3.title",  bodyKey: "download.feat3.body"  },
  { icon: "receipt_long", titleKey: "download.feat4.title",  bodyKey: "download.feat4.body"  },
  { icon: "account_tree", titleKey: "download.feat5.title",  bodyKey: "download.feat5.body"  },
  { icon: "lock",         titleKey: "download.feat6.title",  bodyKey: "download.feat6.body"  },
];

const STEPS = [
  { n: "01", titleKey: "download.step1.title", bodyKey: "download.step1.body" },
  { n: "02", titleKey: "download.step2.title", bodyKey: "download.step2.body" },
  { n: "03", titleKey: "download.step3.title", bodyKey: "download.step3.body" },
];

/* ─── math helpers ──────────────────────────────────────────────── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t: number) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

/* ─── feature screens ───────────────────────────────────────────── */

const RECEIPT = [
  { name: "Amoxicillin 500mg",  qty: 3,  price: "4,500" },
  { name: "Paracetamol 500mg",  qty: 10, price: "3,200" },
  { name: "ORS Sachets 1L",     qty: 5,  price: "2,500" },
  { name: "Metformin 850mg",    qty: 6,  price: "5,400" },
];

function TransactionScreen({ show }: { show: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-8 md:p-16"
      style={{ opacity: show ? 1 : 0, transition: "opacity 0.4s ease", pointerEvents: show ? "auto" : "none" }}
    >
      <div className="w-full max-w-2xl">
        {/* POS header */}
        <div className="flex items-center justify-between mb-8" style={{ opacity: show ? 1 : 0, transform: show ? "none" : "translateY(-16px)", transition: "all 0.5s ease 0.1s" }}>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">{t("download.screen.pos")} · Branch 1, Kariakoo</p>
            <p className="text-white text-2xl font-bold">{t("download.screen.newtx")}</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-3 py-1.5 rounded-full text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t("download.screen.online")} · {t("download.screen.syncing")}
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2 mb-6">
          {RECEIPT.map(({ name, qty, price }, i) => (
            <div
              key={name}
              className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-3.5"
              style={{ opacity: show ? 1 : 0, transform: show ? "none" : "translateX(-20px)", transition: `all 0.4s ease ${0.2 + i * 0.1}s` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[16px]">medication</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{name}</p>
                  <p className="text-white/40 text-xs">× {qty} units</p>
                </div>
              </div>
              <p className="text-white font-semibold text-sm">TZS {price}</p>
            </div>
          ))}
        </div>

          <div className="border-t border-white/10 pt-5 flex items-center justify-between"
            style={{ opacity: show ? 1 : 0, transition: "opacity 0.4s ease 0.7s" }}
          >
          <div>
            <p className="text-white/40 text-xs mb-1">{t("download.screen.total")}</p>
            <p className="text-white text-3xl font-bold">TZS 15,600</p>
          </div>
          <div className="flex gap-2">
            {["M-Pesa", "Cash", "Card"].map((m, i) => (
              <div
                key={m}
                className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                  i === 0 ? "bg-emerald-500 text-white border-emerald-400" : "bg-white/5 text-white/50 border-white/10"
                }`}
                style={{ opacity: show ? 1 : 0, transition: `opacity 0.3s ease ${0.8 + i * 0.08}s` }}
              >
                {m === "Cash" ? t("download.screen.cash") : m === "Card" ? t("download.screen.card") : m}
              </div>
            ))}
          </div>
        </div>

        {/* Process button */}
        <div
          className="mt-5"
          style={{ opacity: show ? 1 : 0, transition: "opacity 0.4s ease 1.0s" }}
        >
          <div className="w-full bg-primary text-white rounded-xl py-4 flex items-center justify-center gap-2 text-sm font-semibold animate-glow-pulse cursor-default">
            <span className="material-symbols-outlined text-[18px]">contactless</span>
            {t("download.screen.process")}
          </div>
        </div>
      </div>
    </div>
  );
}

const NOTIFICATIONS = [
  { icon: "warning",    color: "amber",   titleKey: "download.screen.notif.lowstock",     bodyKey: "download.screen.notif.lowstock.body",     timeKey: "download.screen.notif.now",   branchKey: "download.screen.branch1" },
  { icon: "sync",       color: "emerald", titleKey: "download.screen.notif.synced",       bodyKey: "download.screen.notif.synced.body",       timeKey: "download.screen.notif.2min",  branchKey: "download.screen.branch2" },
  { icon: "storefront", color: "blue",    titleKey: "download.screen.notif.orderready",   bodyKey: "download.screen.notif.orderready.body",   timeKey: "download.screen.notif.5min",  branchKey: "download.screen.notif.all" },
  { icon: "event",      color: "rose",    titleKey: "download.screen.notif.expiry",       bodyKey: "download.screen.notif.expiry.body",       timeKey: "download.screen.notif.8min",  branchKey: "download.screen.branch3" },
];

const colorMap: Record<string, string> = {
  amber:   "bg-amber-500/15 border-amber-500/30 text-amber-400",
  emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  blue:    "bg-blue-500/15 border-blue-500/30 text-blue-400",
  rose:    "bg-rose-500/15 border-rose-500/30 text-rose-400",
};

function NotificationsScreen({ show }: { show: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-8 md:p-16"
      style={{ opacity: show ? 1 : 0, transition: "opacity 0.4s ease", pointerEvents: show ? "auto" : "none" }}
    >
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8" style={{ opacity: show ? 1 : 0, transition: "all 0.4s ease 0.05s" }}>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-1">{t("download.screen.notif.title")}</p>
            <p className="text-white text-2xl font-bold">4 {t("download.screen.notif.new")}</p>
          </div>
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {t("download.screen.notif.live")}
          </div>
        </div>

        <div className="space-y-3">
          {NOTIFICATIONS.map(({ icon, color, titleKey, bodyKey, timeKey, branchKey }, i) => (
            <div
              key={titleKey}
              className="flex gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/8 transition-colors cursor-default"
              style={{ opacity: show ? 1 : 0, transform: show ? "none" : "translateY(16px)", transition: `all 0.4s ease ${0.15 + i * 0.1}s` }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${colorMap[color]}`}>
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-white text-sm font-semibold">{t(titleKey)}</p>
                  <p className="text-white/30 text-xs flex-shrink-0">{t(timeKey)}</p>
                </div>
                <p className="text-white/50 text-xs leading-relaxed">{t(bodyKey)}</p>
                <p className="text-white/25 text-[10px] mt-1 uppercase tracking-wider">{t(branchKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MAP_BRANCHES = [
  { name: "Branch 1", city: "Kariakoo", lat: -6.8213, lng: 39.2696, active: true,  txns: "2,841" },
  { name: "Branch 2", city: "Mwenge",   lat: -6.7712, lng: 39.2460, active: true,  txns: "1,203" },
  { name: "Branch 3", city: "Sinza",    lat: -6.7800, lng: 39.2560, active: false, txns: "847"   },
  { name: "Branch 4", city: "Buguruni", lat: -6.8438, lng: 39.2416, active: true,  txns: "1,549" },
  { name: "HQ",       city: "Upanga",   lat: -6.8103, lng: 39.2835, active: true,  txns: "—"     },
];

function MapScreen({ show }: { show: boolean }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const shownOnce = useRef(false);
  const { t } = useI18n();

  // Initialise Leaflet the first time this screen becomes visible
  useEffect(() => {
    if (!show || shownOnce.current) return;
    shownOnce.current = true;

    // Give the container a tick to paint at full size after the opacity transition
    const timer = setTimeout(() => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      import("leaflet").then((L) => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        // Fix broken default icon paths
        // @ts-expect-error private property
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        const map = L.map(mapContainerRef.current!, {
          center: [-6.8, 39.265],
          zoom: 12,
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          className: "cervos-dark-tiles",
          maxZoom: 19,
        }).addTo(map);

        MAP_BRANCHES.forEach((b) => {
          const isHQ    = b.name === "HQ";
          const color   = isHQ ? "#1039b9" : b.active ? "#10b981" : "rgba(255,255,255,0.3)";
          const size    = isHQ ? 16 : 12;
          const pulse   = b.active ? `
            <div style="position:absolute;inset:-8px;border-radius:50%;border:1.5px solid ${color};opacity:0.45;animation:ping 2s ease infinite"></div>
            <div style="position:absolute;inset:-14px;border-radius:50%;border:1px solid ${color};opacity:0.2;animation:ping 2s ease 0.5s infinite"></div>
          ` : "";

          const icon = L.divIcon({
            className: "",
            html: `<div style="position:relative;width:${size}px;height:${size}px">
              ${pulse}
              <div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.6)"></div>
            </div>`,
            iconSize:   [size, size],
            iconAnchor: [size / 2, size / 2],
          });

          L.marker([b.lat, b.lng], { icon })
            .addTo(map)
            .bindPopup(`<strong>${b.name}</strong><br>${b.city}`);
        });

        mapInstanceRef.current = map;
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [show]);

  // Clean up on unmount
  useEffect(() => () => {
    if (mapInstanceRef.current) {
      (mapInstanceRef.current as { remove: () => void }).remove();
      mapInstanceRef.current = null;
    }
  }, []);

  return (
    <div
      className="absolute inset-0 flex items-center p-8 md:p-16 gap-12"
      style={{ opacity: show ? 1 : 0, transition: "opacity 0.4s ease", pointerEvents: show ? "auto" : "none" }}
    >
      {/* Real Leaflet / OSM map */}
      <div
        className="flex-1 relative rounded-2xl overflow-hidden border border-white/10"
        style={{ minHeight: "340px" }}
      >
        <div ref={mapContainerRef} className="absolute inset-0" />
      </div>

      {/* Branch list sidebar */}
      <div className="w-56 flex-shrink-0" style={{ opacity: show ? 1 : 0, transition: "opacity 0.4s ease 0.3s" }}>
        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">{t("download.screen.multibranch")}</p>
        <p className="text-white text-2xl font-bold mb-6">{t("download.screen.network")}</p>

        <div className="space-y-3">
          {MAP_BRANCHES.map(({ name, city, active, txns }, i) => (
            <div
              key={name}
              className="flex items-center gap-3"
              style={{ opacity: show ? 1 : 0, transform: show ? "none" : "translateX(12px)", transition: `all 0.35s ease ${0.4 + i * 0.08}s` }}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium">{name} · {city}</p>
                <p className="text-white/30 text-[10px]">{txns} {t("download.screen.txns")}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
          <p className="text-emerald-400 text-xs font-semibold">{t("download.screen.allonline")}</p>
          <p className="text-white/40 text-[10px] mt-0.5">{t("download.screen.lastsync")}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── detect OS ─────────────────────────────────────────────────── */
function detectOS(): OS {
  if (typeof navigator === "undefined") return "windows";
  const p = navigator.platform.toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("linux")) return "linux";
  return "macos";
}

/* ─── main component ────────────────────────────────────────────── */
export default function DownloadClient({ releases }: DownloadClientProps) {
  const [os, setOs] = useState<OS>("windows");
  const [toast, setToast] = useState(false);
  const { t } = useI18n();
  const osIndex = OS_ORDER.indexOf(os);
  const currentRelease = releases[OS_TO_PLATFORM[os]] ?? null;
  const hasCurrentRelease = !!currentRelease;

  // Scroll expansion state
  const scrollZoneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [scrollP, setScrollP] = useState(0);
  const [clipStart, setClipStart] = useState({ t: 22, r: 3, b: 22, l: 48 });
  const [isCardHovered, setIsCardHovered] = useState(false);

  useEffect(() => { setOs(detectOS()); }, []);

  const handleDownload = (releaseId: string) => {
    window.location.href = `/api/downloads/${releaseId}/redirect`;
  };

  // Capture card bounding rect for clip-path start values
  const captureRect = useCallback(() => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    setClipStart({
      t: clamp((r.top / vh) * 100, 0, 48),
      r: clamp(((vw - r.right) / vw) * 100, 0, 48),
      b: clamp(((vh - r.bottom) / vh) * 100, 0, 48),
      l: clamp((r.left / vw) * 100, 0, 48),
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(captureRect, 300);
    window.addEventListener("resize", captureRect);
    return () => { clearTimeout(t); window.removeEventListener("resize", captureRect); };
  }, [captureRect]);

  // Scroll listener
  useEffect(() => {
    const handleScroll = () => {
      const zone = scrollZoneRef.current;
      if (!zone) return;
      const rect = zone.getBoundingClientRect();
      const scrollable = zone.offsetHeight - window.innerHeight;
      const scrolled = Math.max(0, -rect.top);
      setScrollP(Math.min(1, scrolled / scrollable));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Expansion math — bell curve: 0→1 in first 25%, plateau, 1→0 in last 25%
  const rawExp = scrollP < 0.25 ? scrollP / 0.25 : scrollP > 0.75 ? (1 - scrollP) / 0.25 : 1;
  const expansion = smoothstep(rawExp);

  // Which feature screen (0,1,2) based on scroll position in the fullscreen plateau
  const plateauP = scrollP < 0.25 ? 0 : scrollP > 0.75 ? 1 : (scrollP - 0.25) / 0.5;
  const activeScreen = plateauP < 0.33 ? 0 : plateauP < 0.67 ? 1 : 2;

  // Clip-path: lerp from card bounds → inset(0%)
  const cp = {
    t: lerp(clipStart.t, 0, expansion),
    r: lerp(clipStart.r, 0, expansion),
    b: lerp(clipStart.b, 0, expansion),
    l: lerp(clipStart.l, 0, expansion),
    radius: lerp(28, 0, expansion),
  };

  // Hero/left content fades as card expands
  const heroOpacity = 1 - smoothstep(clamp((scrollP - 0.05) / 0.2, 0, 1));

  // Screen indicator labels
  const SCREEN_LABELS = [t("download.screen.tab1"), t("download.screen.tab2"), t("download.screen.tab3")];

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      <PublicNav />

      {/* ── Scroll-driven hero (sticky within a 250vh zone) ── */}
      <div ref={scrollZoneRef} style={{ minHeight: "250vh" }}>
        <div className="sticky top-0 h-screen overflow-hidden">

          {/* Fullscreen overlay — clip-path driven by scroll */}
          <div
            aria-hidden
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              clipPath: `inset(${cp.t}% ${cp.r}% ${cp.b}% ${cp.l}% round ${cp.radius}px)`,
              opacity: expansion,
              background: "#3e3e46",
              pointerEvents: expansion > 0.3 ? "none" : "none",
            }}
          >
            {/* ── Abstract pill / capsule texture (HTML divs — CSS transforms work with %) ── */}
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none select-none" style={{ opacity: 0.09 }}>
              {/* Pills */}
              <div style={{ position:"absolute", left:"5%",  top:"10%", width:180, height:56,  background:"white", borderRadius:28, transform:"rotate(-18deg)" }} />
              <div style={{ position:"absolute", left:"70%", top:"4%",  width:120, height:38,  background:"white", borderRadius:19, transform:"rotate(12deg)"  }} />
              <div style={{ position:"absolute", left:"52%", top:"76%", width:200, height:60,  background:"white", borderRadius:30, transform:"rotate(-8deg)"  }} />
              <div style={{ position:"absolute", left:"2%",  top:"62%", width:140, height:42,  background:"white", borderRadius:21, transform:"rotate(22deg)"  }} />
              <div style={{ position:"absolute", left:"80%", top:"48%", width:160, height:50,  background:"white", borderRadius:25, transform:"rotate(-30deg)" }} />
              <div style={{ position:"absolute", left:"28%", top:"86%", width:100, height:32,  background:"white", borderRadius:16, transform:"rotate(10deg)"  }} />
              <div style={{ position:"absolute", left:"58%", top:"28%", width:80,  height:26,  background:"white", borderRadius:13, transform:"rotate(-42deg)" }} />
              <div style={{ position:"absolute", left:"13%", top:"40%", width:60,  height:20,  background:"white", borderRadius:10, transform:"rotate(35deg)"  }} />
              {/* Circles */}
              <div style={{ position:"absolute", right:"6%",  top:"14%",   width:44, height:44, background:"white", borderRadius:"50%" }} />
              <div style={{ position:"absolute", left:"3%",   bottom:"8%", width:32, height:32, background:"white", borderRadius:"50%" }} />
              <div style={{ position:"absolute", left:"46%",  top:"3%",    width:24, height:24, background:"white", borderRadius:"50%" }} />
              <div style={{ position:"absolute", right:"4%",  bottom:"14%",width:56, height:56, background:"white", borderRadius:"50%" }} />
              <div style={{ position:"absolute", left:"20%",  top:"18%",   width:16, height:16, background:"white", borderRadius:"50%" }} />
              <div style={{ position:"absolute", left:"68%",  bottom:"6%", width:20, height:20, background:"white", borderRadius:"50%" }} />
            </div>

            {/* Logo watermark — bottom-left, large and inverted to white */}
            <div
              className="absolute bottom-10 left-10 pointer-events-none select-none z-[1]"
              style={{ opacity: 0.22 }}
            >
              <Image
                src="/logo.png"
                alt=""
                width={320}
                height={100}
                className="object-contain object-left"
                style={{ filter: "invert(1) grayscale(1)", width: "320px", height: "auto" }}
              />
            </div>

            {/* Window chrome */}
            <div className="flex items-center gap-2 px-6 py-4 border-b border-white/8">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/60" />
                <div className="w-3 h-3 rounded-full bg-amber-400/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/60" />
              </div>
              <div className="ml-4 flex-1 flex items-center justify-center gap-2">
                <div className="w-4 h-4 relative flex-shrink-0 opacity-60">
                  <Image src="/logo.png" alt="Cervos" fill sizes="16px" priority className="object-contain" style={{ mixBlendMode: "screen" }} />
                </div>
                <span className="text-white/50 text-xs font-medium tracking-wide">Cervos Pharmacy OS · v2.4.1</span>
              </div>
              {/* Screen tabs */}
              <div className="flex gap-1">
                {SCREEN_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all duration-300 ${
                      activeScreen === i ? "bg-primary/30 text-primary border border-primary/40" : "text-white/25"
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Subtle grid bg */}
            <div
              className="absolute inset-0 top-14 pointer-events-none"
              style={{
                backgroundImage: "linear-gradient(rgba(16,57,185,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,57,185,0.04) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />

            {/* Feature screens */}
            <div className="absolute inset-0 top-14">
              <TransactionScreen  show={activeScreen === 0} />
              <NotificationsScreen show={activeScreen === 1} />
              <MapScreen           show={activeScreen === 2} />
            </div>

            {/* Scroll progress bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-500"
                    style={{
                      width: activeScreen === i ? "24px" : "6px",
                      height: "6px",
                      background: activeScreen === i ? "#1039b9" : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </div>
              <p className="text-white/20 text-[10px] uppercase tracking-widest">{t("download.scroll.continue")}</p>
            </div>
          </div>

          {/* Normal hero — fades as overlay expands */}
          <div style={{ opacity: heroOpacity, transition: "opacity 0ms" }}>
            <section className="relative h-screen flex items-center overflow-hidden">
              {/* Grid bg */}
              <div className="absolute inset-0 opacity-[0.025] pointer-events-none" style={{
                backgroundImage: "linear-gradient(#1039b9 1px, transparent 1px), linear-gradient(90deg, #1039b9 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }} />

              <div className="relative max-w-container-max mx-auto px-8 w-full pt-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">

                  {/* Left — pitch */}
                  <div className="lg:col-span-5 flex flex-col gap-8">
                    <div className="animate-fade-in-up" style={{ animationDelay: "0ms" }}>
                      <div className="inline-flex items-center gap-2 bg-primary/8 text-primary px-3 py-1 rounded-full font-label-md text-label-md mb-6 border border-primary/15">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        {t("download.badge")}
                      </div>
                      <h1 className="font-headline-xl text-headline-xl text-ink-deep mb-4 leading-tight">
                        {t("download.hero.title.1")}<br />
                        <span className="text-primary">{t("download.hero.title.2")}</span>
                      </h1>
                      <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
                        {t("download.hero.body")}{" "}
                        <strong className="text-ink-deep">{t("download.hero.body.strong")}</strong>
                      </p>
                    </div>

                    {/* Download card */}
                    <div className="bg-white border border-outline-variant rounded-2xl p-6 shadow-sm animate-fade-in-up hover:shadow-[0_8px_40px_rgba(16,57,185,0.10)] transition-shadow duration-300" style={{ animationDelay: "80ms" }}>
                      {/* OS sliding pill */}
                      <div className="relative mb-5 bg-surface-muted rounded-xl overflow-hidden">
                        <div
                          className="absolute inset-y-0 w-1/3 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none z-0"
                          style={{ left: `${osIndex * 33.333}%` }}
                        >
                          <div className="m-1 h-[calc(100%-8px)] bg-white rounded-lg shadow-md border border-outline-variant/40" />
                        </div>
                        <div className="relative z-10 flex">
                          {OS_ORDER.map((o) => (
                            <button key={o} onClick={() => setOs(o)}
                              className={`group flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 transition-colors duration-200 ${os === o ? "text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                            >
                              <span className={`material-symbols-outlined text-[22px] transition-all duration-200 ${os === o ? "scale-110" : "group-hover:scale-110 group-hover:-translate-y-0.5"}`}>
                                {OS_CONFIG[o].icon}
                              </span>
                              <span className="font-label-md text-[11px] tracking-wide uppercase">
                                {o === "macos" ? "macOS" : o.charAt(0).toUpperCase() + o.slice(1)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {hasCurrentRelease ? (
                        <button
                          onClick={() => handleDownload(currentRelease.id)}
                          className="btn-shimmer w-full bg-primary text-on-primary py-4 px-6 rounded-xl flex justify-center items-center gap-3 font-label-md text-label-md shadow-md text-base hover:scale-[1.02] hover:shadow-[0_6px_32px_rgba(16,57,185,0.35)] active:scale-[0.98] transition-all duration-200"
                        >
                          <span className="material-symbols-outlined">{OS_CONFIG[os].icon}</span>
                          {t(OS_CONFIG[os].labelKey)}
                          <span className="ml-auto font-body-sm text-sm opacity-70">{OS_CONFIG[os].ext}</span>
                        </button>
                      ) : (
                        <button onClick={() => setToast(true)}
                          className="btn-shimmer w-full bg-primary text-on-primary py-4 px-6 rounded-xl flex justify-center items-center gap-3 font-label-md text-label-md shadow-md text-base animate-glow-pulse hover:scale-[1.02] hover:shadow-[0_6px_32px_rgba(16,57,185,0.35)] active:scale-[0.98] transition-all duration-200"
                        >
                          <span className="material-symbols-outlined">{OS_CONFIG[os].icon}</span>
                          {t(OS_CONFIG[os].labelKey)}
                          <span className="ml-auto font-body-sm text-sm opacity-70">{OS_CONFIG[os].ext}</span>
                        </button>
                      )}
                      <p className="text-center font-body-sm text-body-sm text-on-surface-variant mt-3">
                        {hasCurrentRelease
                          ? `${t(OS_CONFIG[os].reqKey)} · v${currentRelease.version} · ${formatBytes(currentRelease.file_size_bytes)}`
                          : `${t(OS_CONFIG[os].reqKey)} · ${t("download.free.noaccount")}`}
                      </p>
                    </div>

                    {/* Social proof */}
                    <div className="flex items-center gap-6 text-on-surface-variant animate-fade-in-up" style={{ animationDelay: "160ms" }}>
                      {[{ icon: "verified", key: "download.no.card" }, { icon: "download", key: "download.5min" }, { icon: "lock", key: "download.offline.first" }].map(({ icon, key }) => (
                        <div key={key} className="flex items-center gap-1.5 font-body-sm text-body-sm hover:text-secondary transition-colors duration-200 cursor-default">
                          <span className="material-symbols-outlined text-[16px] text-secondary">{icon}</span>
                          {t(key)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right — floating app mockup */}
                  <div className="lg:col-span-7 relative animate-fade-in-scale" style={{ animationDelay: "120ms" }}>
                    <div className="absolute inset-0 bg-gradient-to-tr from-surface-container-low to-surface-container rounded-3xl transform rotate-1 scale-105 -z-10 border border-outline-variant/30" />

                    {/* Floating + group for hover */}
                    <div
                      ref={cardRef}
                      className="animate-float group cursor-pointer"
                      onMouseEnter={() => setIsCardHovered(true)}
                      onMouseLeave={() => setIsCardHovered(false)}
                    >
                      <div className="bg-white border border-outline-variant rounded-3xl p-3 shadow-2xl overflow-hidden hover:shadow-[0_24px_80px_rgba(16,57,185,0.14)] transition-shadow duration-500">
                        {/* Window chrome */}
                        <div className="flex items-center gap-1.5 px-3 py-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-red-400/70" />
                          <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                          <div className="w-3 h-3 rounded-full bg-emerald-400/70" />
                          <div className="ml-4 flex-1 bg-surface-muted rounded h-5" />
                        </div>

                        {/* Content area */}
                        <div className="relative bg-surface-muted rounded-2xl h-72 border border-outline-variant/20 overflow-hidden">
                          {/* Default: logo — fades out on hover */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 group-hover:opacity-0 group-hover:scale-95">
                            <div className="w-14 h-14 relative mx-auto mb-3">
                              <Image src="/logo.png" alt="Cervos" fill sizes="56px" className="object-contain opacity-20" style={{ mixBlendMode: "multiply" }} />
                            </div>
                            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[11px]">Cervos Pharmacy OS</p>
                            <p className="font-body-sm text-body-sm text-outline mt-1 text-[10px]">Offline-first · FEFO-optimised · Multi-branch</p>
                          </div>

                          {/* Hover: transaction preview */}
                          <div className="absolute inset-0 p-5 opacity-0 scale-[0.97] group-hover:opacity-100 group-hover:scale-100 transition-all duration-500 pointer-events-none">
                            <div className="flex items-center justify-between mb-4 opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300" style={{ transitionDelay: "80ms" }}>
                              <div>
                                <p className="font-label-md text-[11px] uppercase tracking-wider text-on-surface-variant">{t("download.mockup.stockreceipt")}</p>
                                <p className="font-body-md font-semibold text-ink-deep text-sm">#SR-2847</p>
                              </div>
                              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-label-md">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {t("download.mockup.processing")}
                              </div>
                            </div>
                            <div className="border-t border-outline-variant/50 mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ transitionDelay: "160ms" }} />
                            {[
                              { name: "Amoxicillin 500mg", qty: "× 200 units", batch: "EXP 08/27", ok: true  },
                              { name: "Paracetamol 500mg", qty: "× 500 units", batch: "EXP 03/27", ok: true  },
                              { name: "Metformin 850mg",   qty: "× 100 units", batch: "EXP 11/26", ok: false },
                              { name: "ORS Sachets",        qty: "× 300 units", batch: "EXP 06/27", ok: true  },
                            ].map(({ name, qty, batch, ok }, i) => (
                              <div key={name} className="flex items-center gap-3 py-1.5 opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" style={{ transitionDelay: `${200 + i * 80}ms` }}>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                                  <span className="material-symbols-outlined text-[12px]">{ok ? "check" : "warning"}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-body-sm text-[11px] text-ink-deep font-medium truncate">{name}</p>
                                  <p className="text-[10px] text-on-surface-variant">{qty} · {batch}</p>
                                </div>
                              </div>
                            ))}
                            <div className="border-t border-outline-variant/50 mt-3 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ transitionDelay: "560ms" }} />
                            <div className="flex items-center justify-between opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300" style={{ transitionDelay: "620ms" }}>
                              <p className="text-[10px] text-on-surface-variant font-label-md">4 {t("download.mockup.lines")} · 1,100 {t("download.mockup.units")}</p>
                              <div className="flex items-center gap-1 text-primary text-[10px] font-label-md font-semibold">
                                <span className="material-symbols-outlined text-[13px]">verified</span>
                                {t("download.mockup.synced")}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Scroll hint — shows on hover when not yet scrolling */}
                      {isCardHovered && scrollP < 0.03 && (
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-primary/70 text-xs font-label-md animate-bounce whitespace-nowrap">
                          <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                          {t("download.scroll.hint")}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* ── End scroll zone ── */}

      {/* ── How it works ── */}
      <section className="py-20 bg-surface-container-lowest border-t border-outline-variant/50">
        <div className="max-w-container-max mx-auto px-8 w-full">
          <h2 className="font-headline-lg text-headline-lg text-ink-deep text-center mb-3">{t("download.how.title")}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant text-center mb-12 max-w-lg mx-auto">{t("download.how.body")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map(({ n, titleKey, bodyKey }, i) => (
              <div key={n} className="group relative flex flex-col gap-4 p-6 rounded-2xl border border-transparent hover:bg-white hover:border-outline-variant/60 hover:shadow-[0_8px_32px_rgba(16,57,185,0.07)] transition-all duration-300 cursor-default animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="text-[64px] font-bold text-primary/10 leading-none select-none group-hover:text-primary/20 transition-colors duration-300">{n}</div>
                <div>
                  <h3 className="font-headline-md text-headline-md text-ink-deep mb-2 group-hover:text-primary transition-colors duration-200">{t(titleKey)}</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">{t(bodyKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 bg-surface-base">
        <div className="max-w-container-max mx-auto px-8 w-full">
          <h2 className="font-headline-lg text-headline-lg text-ink-deep text-center mb-3">{t("download.features.title")}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant text-center mb-14 max-w-lg mx-auto">{t("download.features.body")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon, titleKey, bodyKey }, i) => (
              <div key={titleKey} className="group bg-white border border-outline-variant rounded-xl p-6 cursor-default hover:border-primary/40 hover:-translate-y-2 hover:shadow-[0_16px_48px_rgba(16,57,185,0.12)] transition-all duration-300 ease-out animate-fade-in-up" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="w-10 h-10 rounded-full bg-primary/8 flex items-center justify-center mb-4 group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                  <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
                </div>
                <h3 className="font-label-md text-label-md text-ink-deep mb-2 font-semibold group-hover:text-primary transition-colors duration-200">{t(titleKey)}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{t(bodyKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── System requirements ── */}
      <section className="py-20 bg-surface-container-lowest border-t border-outline-variant/50">
        <div className="max-w-container-max mx-auto px-8 w-full">
          <h2 className="font-headline-md text-headline-md text-ink-deep text-center mb-10">{t("download.req.title")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: "memory",          titleKey: "download.req.processor.title", specKey: "download.req.processor.spec", noteKey: "download.req.processor.note" },
              { icon: "developer_board", titleKey: "download.req.ram.title",       specKey: "download.req.ram.spec",       noteKey: "download.req.ram.note" },
              { icon: "hard_drive",      titleKey: "download.req.storage.title",   specKey: "download.req.storage.spec",   noteKey: "download.req.storage.note" },
              { icon: "public",          titleKey: "download.req.network.title",   specKey: "download.req.network.spec",   noteKey: "download.req.network.note" },
            ].map((r, i) => (
              <div key={r.titleKey} className="group bg-white border border-outline-variant rounded-xl p-6 hover:border-primary/30 hover:-translate-y-1.5 hover:shadow-[0_8px_32px_rgba(16,57,185,0.09)] transition-all duration-300 cursor-default animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center mb-4 group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                  <span className="material-symbols-outlined text-[20px] text-primary">{r.icon}</span>
                </div>
                <p className="font-label-md text-label-md text-on-surface-variant mb-1 uppercase tracking-wider text-[11px]">{t(r.titleKey)}</p>
                <p className="font-body-md text-body-md text-ink-deep font-semibold">{t(r.specKey)}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">{t(r.noteKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-20 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="relative max-w-container-max mx-auto px-8 w-full text-center">
          <h2 className="font-headline-lg text-headline-lg text-on-primary mb-4">{t("download.cta.title")}</h2>
          <p className="font-body-lg text-body-lg text-on-primary/75 mb-8 max-w-lg mx-auto">{t("download.cta.body")}</p>
          {hasCurrentRelease ? (
            <button
              onClick={() => handleDownload(currentRelease.id)}
              className="inline-flex items-center gap-3 bg-on-primary text-primary font-label-md text-label-md py-4 px-8 rounded-xl shadow-lg text-base hover:scale-[1.03] hover:shadow-[0_12px_48px_rgba(0,0,0,0.25)] active:scale-[0.98] transition-all duration-200"
            >
              <span className="material-symbols-outlined">{OS_CONFIG[os].icon}</span>
              {t(OS_CONFIG[os].labelKey)}
            </button>
          ) : (
            <button onClick={() => setToast(true)} className="inline-flex items-center gap-3 bg-on-primary text-primary font-label-md text-label-md py-4 px-8 rounded-xl shadow-lg text-base hover:scale-[1.03] hover:shadow-[0_12px_48px_rgba(0,0,0,0.25)] active:scale-[0.98] transition-all duration-200">
              <span className="material-symbols-outlined">{OS_CONFIG[os].icon}</span>
              {t(OS_CONFIG[os].labelKey)}
            </button>
          )}
          <p className="font-body-sm text-body-sm text-on-primary/50 mt-4">
            {t("download.cta.signin")}{" "}
            <Link href="/auth" className="underline text-on-primary/75 hover:text-on-primary transition-colors">{t("download.cta.signin.link")}</Link>
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-outline-variant bg-surface-container-lowest">
        <p className="font-body-sm text-body-sm text-on-surface-variant">© {new Date().getFullYear()} Cervos · hq@cervos.online</p>
        <div className="flex gap-6 font-label-md text-label-md">
          {[{ key: "footer.terms", href: "/terms" }, { key: "footer.privacy", href: "/privacy" }, { key: "footer.suppliers", href: "/supplier/quote" }, { key: "footer.signin", href: "/auth" }].map(({ key, href }) => (
            <Link key={key} href={href} className="text-on-surface-variant hover:text-secondary transition-colors duration-200">{t(key)}</Link>
          ))}
        </div>
      </footer>

      {toast && (
        <Toast message={t("download.toast.coming")} type="info" onClose={() => setToast(false)} />
      )}
    </div>
  );
}
