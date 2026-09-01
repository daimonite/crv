import type { NextConfig } from "next";
import dns from "node:dns";

// Windows + some home ISPs advertise IPv6 that doesn't actually route, which
// makes Node's fetch()/undici hang for ~30-45s per outbound call before
// failing with a bare "TypeError: fetch failed" (affects calls to Supabase,
// Payme, or any external HTTPS host from this dev server). Forcing IPv4-first
// resolution avoids the hang. Safe to leave in for production too.
dns.setDefaultResultOrder("ipv4first");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.117", "172.16.0.2"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
