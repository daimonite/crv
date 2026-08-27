import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cervos.online";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    "",
    "/auth",
    "/news",
    "/privacy",
    "/terms",
    "/support",
    "/download",
  ];

  const now = new Date();

  return staticPages.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1.0 : 0.7,
  }));
}
