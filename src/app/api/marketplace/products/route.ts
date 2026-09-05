import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  // Catalog listings are intentionally public. The desktop needs to display
  // supplier products before a restored session is available; sensitive
  // actions (connection approval, checkout, and payment) still authenticate
  // and verify branch ownership in their own route handlers.

  // Service access is limited to these explicitly mapped public catalogue
  // fields; checkout never trusts client-supplied product price or stock.
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
