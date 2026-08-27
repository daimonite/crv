/**
 * @route GET /api/hq/export/news
 * @access HQ session required
 * @description Returns all news posts as CSV
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidHQToken, HQ_COOKIE_NAME } from "@/lib/hq-auth";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { arrayToCSV } from "@/lib/export";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(HQ_COOKIE_NAME)?.value;
  if (!isValidHQToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  const { data: posts, error } = await supabase
    .from("news_posts")
    .select(`id, slug, title, excerpt, author_name, category, tags, published, published_at, created_at`)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (posts ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    tags: Array.isArray(p.tags) ? p.tags.join("; ") : "",
  }));

  const cols = [
    { key: "id", header: "ID" },
    { key: "created_at", header: "Created" },
    { key: "published_at", header: "Published At" },
    { key: "title", header: "Title" },
    { key: "slug", header: "Slug" },
    { key: "author_name", header: "Author" },
    { key: "category", header: "Category" },
    { key: "tags", header: "Tags" },
    { key: "excerpt", header: "Excerpt" },
    { key: "published", header: "Published" },
  ];

  const csv = arrayToCSV(rows as Record<string, unknown>[], cols);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="news-posts-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
