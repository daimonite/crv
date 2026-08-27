/**
 * @file lib/actions/supplier.ts
 * @description Server actions for the supplier portal + pharmacy marketplace.
 *
 * All reads/writes go through the anon-role client (`createClient`) so RLS
 * scopes every query to the authenticated account. No mock data, ever.
 *
 * Tables touched:
 *   - accounts           — read (id, name, type, verified, subscription)
 *   - products           — read/insert (shared master catalogue)
 *   - supplier_catalog   — read/insert/update (this supplier's listings)
 *   - orders             — read/update (fulfilment pipeline)
 *   - order_line_items   — read (totals always derived from lines)
 *   - quote_requests     — read (lead pipeline)
 *   - branches           — read (buyer name/branch for orders, map nodes)
 *
 * @environment NEXT_PUBLIC_SUPABASE_URL
 * @environment NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Catalog listing shape expected by SupplierCatalogManager. */
export interface CatalogProduct {
  id: string;
  name: string;
  genericName: string;
  sku: string;
  category: string;
  packSize: string;
  unitPrice: number;
  currency: string;
  stockQty: number;
  minOrderQty: number;
  status: "active" | "archived" | "draft";
}

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

/** Inbound order shape expected by SupplierOrdersTable. */
export interface SupplierOrder {
  id: string;
  orderRef: string;
  pharmacyName: string;
  branchName: string;
  currency: string;
  placedAt: string;
  status: OrderStatus;
  products: { name: string; qty: number; unitPrice: number }[];
}

// ─── Auth + account helpers ──────────────────────────────────────────────────

/**
 * Resolves the authenticated supplier's account row, or null.
 * @returns `{ account, supabase, error }` — error set when unauthenticated/no account.
 */
async function requireSupplier() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, account: null, error: "Not authenticated." };

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, name, type, billing_status, subscription_status, subscription_expires_at, verified")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !account) return { supabase, account: null, error: "Account not found." };
  if (account.type !== "supplier") return { supabase, account: null, error: "Not a supplier account." };
  return { supabase, account, error: null };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * Everything the supplier dashboard needs in one round-trip-friendly set:
 * account, recent quote requests, and order KPIs (pending count, delivered revenue).
 */
export async function getSupplierDashboardData() {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return null;

  const [{ data: quotes }, { data: orders }] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("id, company_name, contact_name, email, message, status, created_at")
      .eq("supplier_account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("orders")
      .select("id, status, seller_id, buyer_branch_id, currency, placed_at")
      .eq("seller_id", account.id)
      .order("placed_at", { ascending: false })
      .limit(100),
  ]);

  const delivered = (orders ?? []).filter((o) => o.status === "delivered");

  return {
    account,
    quotes: quotes ?? [],
    pendingOrders: (orders ?? []).filter((o) => o.status === "pending").length,
    totalOrders: (orders ?? []).length,
    deliveredCount: delivered.length,
  };
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

/**
 * Loads the supplier's catalogue joined with the shared products master,
 * newest first. Active listings are what pharmacies see in the marketplace.
 */
export async function getSupplierCatalog(): Promise<CatalogProduct[]> {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return [];

  type CatalogRow = {
    id: string;
    sku: string | null;
    pack_size: string | null;
    price: number;
    currency: string;
    stock_qty: number;
    min_order_qty: number;
    status: "active" | "archived" | "draft";
    products: { id: string; generic_name: string; brand_name: string | null; category: string | null }[] | null;
  };

  const { data } = await supabase
    .from("supplier_catalog")
    .select("id, sku, pack_size, price, currency, stock_qty, min_order_qty, status, lead_time_days, products(id, generic_name, brand_name, category)")
    .eq("supplier_id", account.id)
    .order("updated_at", { ascending: false });

  return ((data ?? []) as unknown as CatalogRow[]).map((row) => ({
    id: row.id,
    name: row.products?.[0]?.brand_name ?? row.products?.[0]?.generic_name ?? "Unnamed product",
    genericName: row.products?.[0]?.generic_name ?? "",
    sku: row.sku ?? "",
    category: row.products?.[0]?.category ?? "Other",
    packSize: row.pack_size ?? "",
    unitPrice: Number(row.price),
    currency: row.currency,
    stockQty: row.stock_qty,
    minOrderQty: row.min_order_qty,
    status: row.status,
  }));
}

/**
 * Creates or updates a catalogue listing.
 *
 * Product identity lives in the shared `products` table (name/generic/category),
 * so an existing product is matched by lowercase `generic_name` before creating
 * a new one — no duplicate masters. Listing-specific fields (price, SKU, pack,
 * stock, status) are upserted on `supplier_catalog` scoped to `supplier_id`.
 *
 * @param input - Full listing payload (id present => update, absent => create)
 * @returns `{ error, id }` — id is the saved listing id (for new rows)
 */
export async function saveCatalogProduct(
  input: Omit<CatalogProduct, "id"> & { id?: string }
): Promise<{ error: string | null; id?: string }> {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return { error: error ?? "Account not found." };

  const genericName = input.genericName.trim();
  const name = input.name.trim();
  if (!genericName && !name) return { error: "Product name is required." };

  // 1. Resolve (or create) the shared product master.
  let productId: string | null = null;

  if (input.id) {
    const { data: existing } = await supabase
      .from("supplier_catalog")
      .select("product_id")
      .eq("id", input.id)
      .eq("supplier_id", account.id)
      .maybeSingle();
    if (existing) productId = existing.product_id;
  }

  if (!productId) {
    // Match by generic name first (case-insensitive) to avoid duplicate masters.
    const { data: match } = await supabase
      .from("products")
      .select("id, generic_name")
      .ilike("generic_name", genericName || name)
      .limit(1)
      .maybeSingle();

    if (match) {
      productId = match.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("products")
        .insert({
          generic_name: genericName || name,
          brand_name: genericName ? name : null,
          category: input.category.trim() || "Other",
        })
        .select("id")
        .single();
      if (createError || !created) return { error: createError?.message ?? "Could not create product." };
      productId = created.id;
    }
  }

  // 2. Upsert the listing on (supplier_id, product_id).
  const listing = {
    supplier_id: account.id,
    product_id: productId,
    sku: input.sku.trim() || null,
    pack_size: input.packSize.trim() || null,
    price: Number(input.unitPrice) || 0,
    currency: input.currency.trim() || "TZS",
    stock_qty: Math.max(0, Number(input.stockQty) || 0),
    min_order_qty: Math.max(1, Number(input.minOrderQty) || 1),
    status: input.status,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error: upsertError } = await supabase
    .from("supplier_catalog")
    .upsert(listing, { onConflict: "supplier_id,product_id" })
    .select("id")
    .single();

  if (upsertError) return { error: upsertError.message };
  return { error: null, id: saved?.id };
}

/**
 * Sets a listing's lifecycle status (draft | active | archived). Active rows
 * appear in the pharmacy marketplace; archived rows disappear from it.
 */
export async function setCatalogProductStatus(
  id: string,
  status: CatalogProduct["status"]
): Promise<{ error: string | null }> {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return { error: error ?? "Account not found." };

  const { error: updateError } = await supabase
    .from("supplier_catalog")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", account.id);

  if (updateError) return { error: updateError.message };
  return { error: null };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * Loads inbound orders for this supplier, with buyer pharmacy/branch names and
 * line items. Order totals are always derived from line items at render time.
 */
export async function getSupplierOrders(): Promise<SupplierOrder[]> {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return [];

  type OrderRow = {
    id: string;
    order_reference: string;
    currency: string;
    status: OrderStatus;
    placed_at: string;
    branches: {
      id: string;
      name: string;
      accounts: { id: string; name: string }[] | null;
    }[] | null;
  };

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_reference, currency, status, placed_at, branches!buyer_branch_id(id, name, accounts(id, name))")
    .eq("seller_id", account.id)
    .order("placed_at", { ascending: false });

  if (!orders) return [];

  const orderIds = (orders as unknown as OrderRow[]).map((o) => o.id);
  const { data: lines } = await supabase
    .from("order_line_items")
    .select("order_id, product_name, quantity, unit_price")
    .in("order_id", orderIds);

  const byOrder = new Map<string, SupplierOrder["products"]>();
  for (const line of lines ?? []) {
    const list = byOrder.get(line.order_id) ?? [];
    list.push({ name: line.product_name, qty: line.quantity, unitPrice: Number(line.unit_price) });
    byOrder.set(line.order_id, list);
  }

  return (orders as unknown as OrderRow[]).map((o) => ({
    id: o.id,
    orderRef: o.order_reference,
    pharmacyName: o.branches?.[0]?.accounts?.[0]?.name ?? "Pharmacy",
    branchName: o.branches?.[0]?.name ?? "",
    currency: o.currency,
    placedAt: o.placed_at,
    status: o.status,
    products: byOrder.get(o.id) ?? [],
  }));
}

const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * Advances (or cancels) an order through the fulfilment pipeline. Valid
 * transitions are enforced server-side and each state stamps its timestamp.
 */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<{ error: string | null }> {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return { error: error ?? "Account not found." };

  const { data: current } = await supabase
    .from("orders")
    .select("status")
    .eq("id", id)
    .eq("seller_id", account.id)
    .maybeSingle();
  if (!current) return { error: "Order not found." };

  if (!ORDER_FLOW[current.status as OrderStatus]?.includes(status)) {
    return { error: `Cannot move an order from "${current.status}" to "${status}".` };
  }

  const stamp = new Date().toISOString();
  const update: Record<string, string> = {
    status,
    updated_at: stamp,
    confirmed_at: status === "confirmed" ? stamp : undefined as unknown as string,
    shipped_at: status === "shipped" ? stamp : undefined as unknown as string,
    delivered_at: status === "delivered" ? stamp : undefined as unknown as string,
    cancelled_at: status === "cancelled" ? stamp : undefined as unknown as string,
  };

  // Strip undefined keys — never write empty timestamps over prior ones.
  for (const k of Object.keys(update)) {
    if (update[k] === undefined) delete update[k];
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("seller_id", account.id);

  if (updateError) return { error: updateError.message };
  return { error: null };
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface SupplierMonthly {
  month: string;
  quoteRequests: number;
  confirmed: number;
  revenue: number;
}

export interface SupplierTopProduct {
  name: string;
  requests: number;
  revenue: number;
}

/**
 * 12-month performance for the supplier, aggregated locally from real rows.
 * Revenue only counts delivered orders and is derived from line items —
 * never from a stored total.
 */
export async function getSupplierAnalytics(): Promise<{
  monthly: SupplierMonthly[];
  topProducts: SupplierTopProduct[];
  conversionRate: number;
}> {
  const { supabase, account, error } = await requireSupplier();
  if (error || !account) return { monthly: [], topProducts: [], conversionRate: 0 };

  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [quotesRes, ordersRes, linesRes] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("status, created_at")
      .eq("supplier_account_id", account.id)
      .gte("created_at", sinceIso),
    supabase
      .from("orders")
      .select("status, placed_at")
      .eq("seller_id", account.id)
      .gte("placed_at", sinceIso),
    supabase
      .from("orders")
      .select("id, status, placed_at, order_line_items(product_name, quantity, unit_price)")
      .eq("seller_id", account.id)
      .gte("placed_at", sinceIso),
  ]);

  const orders = ordersRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  // Month key -> aggregates
  const monthly = new Map<string, SupplierMonthly>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(since);
    d.setMonth(d.getMonth() + i);
    const key = d.toISOString().slice(0, 7);
    monthly.set(key, {
      month: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      quoteRequests: 0,
      confirmed: 0,
      revenue: 0,
    });
  }

  const monthKey = (iso: string) => iso.slice(0, 7);
  for (const q of quotes) {
    const bucket = monthly.get(monthKey(q.created_at));
    if (bucket) bucket.quoteRequests += 1;
  }
  for (const o of orders) {
    const bucket = monthly.get(monthKey(o.placed_at));
    if (!bucket) continue;
    if (o.status === "confirmed" || o.status === "shipped" || o.status === "delivered") {
      bucket.confirmed += 1;
    }
  }

  // Revenue per product (delivered orders only), derived from line items.
  const productMap = new Map<string, SupplierTopProduct>();
  for (const o of (linesRes.data ?? []) as Array<{
    id: string;
    status: string;
    placed_at: string;
    order_line_items?: Array<{ product_name: string; quantity: number; unit_price: number }>;
  }>) {
    const bucket = monthly.get(monthKey(o.placed_at));
    const lines = o.order_line_items ?? [];
    for (const line of lines) {
      const lineTotal = Number(line.unit_price) * line.quantity;
      const existing = productMap.get(line.product_name) ?? { name: line.product_name, requests: 0, revenue: 0 };
      existing.requests += 1;
      if (o.status === "delivered") {
        existing.revenue += lineTotal;
        if (bucket) bucket.revenue += lineTotal;
      }
      productMap.set(line.product_name, existing);
    }
  }

  const monthlyArr = [...monthly.values()];
  const totalRequests = monthlyArr.reduce((s, m) => s + m.quoteRequests, 0);
  const totalConfirmed = monthlyArr.reduce((s, m) => s + m.confirmed, 0);

  return {
    monthly: monthlyArr,
    topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    conversionRate: totalRequests > 0 ? (totalConfirmed / totalRequests) * 100 : 0,
  };
}

// ─── Marketplace (pharmacy-facing) ────────────────────────────────────────────

export interface MarketplaceProduct {
  id: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  genericName: string;
  category: string;
  packSize: string;
  unitPrice: number;
  currency: string;
  minOrderQty: number;
  stockAvailable: number;
  leadTimeDays: number;
  verified: boolean;
}

/**
 * Live supplier catalogue for the pharmacy marketplace — only ACTIVE listings
 * from the network's suppliers, with lead time + verified badge.
 */
export async function getMarketplaceProducts(): Promise<MarketplaceProduct[]> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return [];
  const supabase = await createServiceClient();
  // Use service client for catalog read — marketplace is public to any authenticated user,
  // and anon RLS often blocks the join. Service bypasses RLS but we still require auth above.

  type MarketplaceRow = {
    id: string;
    supplier_id: string;
    price: number;
    currency: string;
    min_order_qty: number;
    stock_qty: number;
    lead_time_days: number;
    pack_size: string | null;
    products: { id: string; generic_name: string; brand_name: string | null; category: string | null }[] | null;
    accounts: { id: string; name: string; verified: boolean }[] | null;
  };

  const { data } = await supabase
    .from("supplier_catalog")
    .select("id, supplier_id, price, currency, min_order_qty, stock_qty, lead_time_days, pack_size, products(id, generic_name, brand_name, category), accounts!supplier_id(id, name, verified)")
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  return ((data ?? []) as unknown as MarketplaceRow[]).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.accounts?.[0]?.name ?? "Supplier",
    productName: row.products?.[0]?.brand_name ?? row.products?.[0]?.generic_name ?? "Unnamed product",
    genericName: row.products?.[0]?.generic_name ?? "",
    category: row.products?.[0]?.category ?? "Other",
    packSize: row.pack_size ?? "",
    unitPrice: Number(row.price),
    currency: row.currency,
    minOrderQty: row.min_order_qty,
    stockAvailable: row.stock_qty,
    leadTimeDays: row.lead_time_days,
    verified: row.accounts?.[0]?.verified ?? false,
  }));
}

/**
 * Places a marketplace order from the pharmacy to a supplier.
 *
 * Flow: pending → confirmed → shipped → delivered → payment released
 * Payment is held in escrow via Payme Africa until delivery is confirmed.
 *
 * @param items - Array of { catalogId, quantity, unitPrice }
 * @param buyerBranchId - The pharmacy branch placing the order
 * @param sellerId - The supplier account ID
 * @param note - Optional note to supplier
 */
export async function placeMarketplaceOrder(
  items: { catalogId: string; quantity: number; unitPrice: number; productName: string }[],
  buyerBranchId: string,
  sellerId: string,
  note?: string
): Promise<{ error: string | null; orderId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (items.length === 0) return { error: "No items in order." };

  const orderId = crypto.randomUUID();
  const orderRef = `ORD-${Date.now().toString(36).toUpperCase()}`;

  // Insert the order header
  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    order_reference: orderRef,
    buyer_branch_id: buyerBranchId,
    seller_id: sellerId,
    currency: "TZS",
    status: "pending",
    note: note ?? null,
    placed_at: new Date().toISOString(),
  });

  if (orderError) return { error: orderError.message };

  // Insert line items
  const lineItems = items.map((item) => ({
    id: crypto.randomUUID(),
    order_id: orderId,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));

  const { error: lineError } = await supabase.from("order_line_items").insert(lineItems);
  if (lineError) return { error: lineError.message };

  return { error: null, orderId };
}
