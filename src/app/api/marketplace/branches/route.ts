import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/marketplace/branches?search=...
 * Supplier-only: search pharmacy branches by name to send a connection request.
 * Scoped to authenticated supplier accounts, not public — mirrors how the
 * marketplace catalog itself is visible to any authenticated account.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = await createServiceClient();
  const { data: account } = await service
    .from("accounts")
    .select("id, type")
    .eq("auth_user_id", user.id)
    .single();
  if (!account || account.type !== "supplier") {
    return NextResponse.json({ error: "Only supplier accounts can search branches." }, { status: 403 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  if (search.length < 2) return NextResponse.json({ branches: [] });

  const { data, error } = await service
    .from("branches")
    .select("id, name, accounts!account_id(name)")
    .ilike("name", `%${search}%`)
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as { id: string; name: string; accounts: { name: string } | null }[];
  return NextResponse.json({
    branches: rows.map((r) => ({ id: r.id, name: r.name, pharmacyName: r.accounts?.name ?? "" })),
  });
}
