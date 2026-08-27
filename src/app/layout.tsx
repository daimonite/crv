import type { Metadata } from "next";
import Providers from "@/providers";
import MockModeBar from "@/components/MockModeBar";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cervos — Pharmacy OS",
  description:
    "Precision logistics for the modern pharmacy. Secure, offline-first, FEFO-optimised.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Cervos — Pharmacy OS",
    description: "Precision logistics for the modern pharmacy. Secure, offline-first, FEFO-optimised.",
    siteName: "Cervos",
    images: [{ url: "/logo.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cervos — Pharmacy OS",
    description: "Precision logistics for the modern pharmacy.",
    images: ["/logo.png"],
  },
};

export const links = [
  { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang === "SW" ? "sw" : "en"} suppressHydrationWarning>
      {/* No explicit <head> needed — Material Symbols loaded via globals.css @import
          to avoid third-party devtools <script> injection causing a React hydration mismatch */}
      <body className="bg-surface text-on-surface font-body-md antialiased">
        <Providers initialLang={lang}>{children}</Providers>
        <MockModeBar />
      </body>
    </html>
  );
}
