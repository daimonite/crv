import { NextRequest, NextResponse } from "next/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function getUserFromRequest(request: NextRequest) {
  // Try cookie-based auth first (web)
  try {
    const cookieClient = await createClient();
    const { data: { user } } = await cookieClient.auth.getUser();
    if (user) return { user, client: cookieClient };
  } catch { /* fallback to Bearer */ }

  // Try Bearer token (desktop apps)
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const bearerClient = createAnonClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await bearerClient.auth.getUser();
    if (user) return { user, client: bearerClient as unknown as Awaited<ReturnType<typeof createClient>> };
  }

  return { user: null, client: null };
}

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Use service client to bypass RLS but still require auth
  const supabase = await createServiceClient();

  type Row = {
    id: string;
    supplier_id: string;
    price: number;
    currency: string;
    min_order_qty: number;
    stock_qty: number;
    lead_time_days: number;
    pack_size: string | null;
    products: { id: string; generic_name: string; brand_name: string | null; category: string | null } | null;
    accounts: { id: string; name: string; verified: boolean } | null;
  };

  const { data, error } = await supabase
    .from("supplier_catalog")
    .select("id, supplier_id, price, currency, min_order_qty, stock_qty, lead_time_days, pack_size, products(id, generic_name, brand_name, category), accounts!supplier_id(id, name, verified)")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[marketplace/products] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products = ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.accounts?.name ?? "Supplier",
    productName: row.products?.brand_name ?? row.products?.generic_name ?? "Unnamed product",
    genericName: row.products?.generic_name ?? "",
    category: row.products?.category ?? "Other",
    packSize: row.pack_size ?? "",
    unitPrice: Number(row.price),
    currency: row.currency,
    minOrderQty: row.min_order_qty,
    stockAvailable: row.stock_qty,
    leadTimeDays: row.lead_time_days,
    verified: row.accounts?.verified ?? false,
  }));

  return NextResponse.json({ products });
}
