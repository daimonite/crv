import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cervos.online";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/hq/", "/dashboard/", "/supplier/", "/auth/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
