"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface BranchOperatorSession {
  operator: {
    id: string;
    name: string;
    role: "admin" | "operator";
    branch_id: string;
    branch_name: string;
  };
  branch: {
    id: string;
    name: string;
    account_id: string;
    subscription_status: string | null;
    last_synced_at: string | null;
  };
  account: {
    id: string;
    name: string;
  };
}

export interface BatchRow {
  id: string;
  product_id: string;
  quantity: number;
  cost_price: number | null;
  sale_price: number | null;
  expiry_date: string | null;
  product_generic: string | null;
  product_brand: string | null;
}

/**
 * Resolves the signed-in user as a web-enabled branch operator. Returns the
 * operator session (operator + branch + account) or an error string.
 */
export async function requireBranchOperator(): Promise<
  { data: BranchOperatorSession | null; error: string | null }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated." };

  const { data: op } = await supabase
    .from("operators")
    .select("id, name, role, branch_id, web_enabled, branches(id, name, account_id, subscription_status, last_synced_at)")
    .eq("auth_user_id", user.id)
    .eq("web_enabled", true)
    .maybeSingle();

  if (!op) return { data: null, error: "Operator access required." };

  const branch = (op.branches as unknown as {
    id: string;
    name: string;
    account_id: string;
    subscription_status: string | null;
    last_synced_at: string | null;
  }[] | null)?.find((b) => b.id === op.branch_id);

  if (!branch) return { data: null, error: "Operator branch not found." };

  // The operator may only act on data belonging to their own branch's account.
  const service = await createServiceClient();
  const { data: account } = await service
    .from("accounts")
    .select("id, name")
    .eq("id", branch.account_id)
    .single();

  return {
    data: {
      operator: {
        id: op.id,
        name: op.name,
        role: op.role as "admin" | "operator",
        branch_id: op.branch_id,
        branch_name: branch.name,
      },
      branch: {
        id: branch.id,
        name: branch.name,
        account_id: branch.account_id,
        subscription_status: branch.subscription_status,
        last_synced_at: branch.last_synced_at,
      },
      account: { id: account?.id ?? branch.account_id, name: account?.name ?? "Pharmacy" },
    },
    error: null,
  };
}

export interface BranchDashboardData {
  branch: BranchOperatorSession["branch"];
  account: BranchOperatorSession["account"];
  totalSku: number;
  totalUnits: number;
  expiringSoon: number;
  expired: number;
  pendingOrders: number;
  todaySalesCount: number;
  todaySalesTotal: number;
  lastSyncedAt: string | null;
}

export async function getBranchDashboard(): Promise<BranchDashboardData | null> {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) return null;

  const service = await createServiceClient();
  const branchId = session.branch.id;

  const [{ data: batches }, { data: orders }, { data: sales }] = await Promise.all([
    service.from("batches").select("quantity, expiry_date").eq("branch_id", branchId),
    service.from("orders").select("id").eq("buyer_branch_id", branchId).eq("status", "pending"),
    service.from("sales").select("id, total, created_at").eq("branch_id", branchId),
  ]);

  const batchList = (batches ?? []) as Array<{ quantity: number; expiry_date: string | null }>;
  const now = Date.now();
  const dayMs = 86400000;
  let totalUnits = 0;
  let expiringSoon = 0;
  let expired = 0;
  for (const batch of batchList) {
    totalUnits += Number(batch.quantity) || 0;
    if (batch.expiry_date) {
      const diff = new Date(batch.expiry_date).getTime() - now;
      if (diff < 0) expired++;
      else if (diff < 30 * dayMs) expiringSoon++;
    }
  }

  const salesList = (sales ?? []) as Array<{ total: number; created_at: string }>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySales = salesList.filter((s) => new Date(s.created_at) >= today);
  const todaySalesTotal = todaySales.reduce((sum, s) => sum + Number(s.total), 0);

  return {
    branch: session.branch,
    account: session.account,
    totalSku: batchList.length,
    totalUnits,
    expiringSoon,
    expired,
    pendingOrders: (orders ?? []).length,
    todaySalesCount: todaySales.length,
    todaySalesTotal,
    lastSyncedAt: session.branch.last_synced_at,
  };
}

export async function getBranchInventory(): Promise<BatchRow[]> {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) return [];

  const service = await createServiceClient();
  const { data } = await service
    .from("batches")
    .select("id, product_id, quantity, cost_price, sale_price, expiry_date, products(generic_name, brand_name)")
    .eq("branch_id", session.branch.id)
    .order("expiry_date", { ascending: true });

  return ((data ?? []) as unknown as Array<{
    id: string;
    product_id: string;
    quantity: number;
    cost_price: number | null;
    sale_price: number | null;
    expiry_date: string | null;
    products: { generic_name: string; brand_name: string | null }[] | null;
  }>).map((row) => ({
    id: row.id,
    product_id: row.product_id,
    quantity: row.quantity,
    cost_price: Number(row.cost_price) || null,
    sale_price: Number(row.sale_price) || null,
    expiry_date: row.expiry_date,
    product_generic: row.products?.[0]?.generic_name ?? null,
    product_brand: row.products?.[0]?.brand_name ?? null,
  }));
}

export interface BranchOrderRow {
  id: string;
  order_reference: string;
  supplier_name: string | null;
  status: string;
  placed_at: string | null;
  total: number;
  items: { product_name: string; quantity: number; unit_price: number }[];
}

export async function getBranchOrders(): Promise<BranchOrderRow[]> {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) return [];

  const service = await createServiceClient();
  const branchId = session.branch.id;

  const { data: orders } = await service
    .from("orders")
    .select("id, order_reference, seller_id, status, placed_at")
    .eq("buyer_branch_id", branchId)
    .order("placed_at", { ascending: false });

  const orderList = (orders ?? []) as Array<{
    id: string;
    order_reference: string;
    seller_id: string;
    status: string;
    placed_at: string | null;
  }>;
  if (orderList.length === 0) return [];

  const orderIds = orderList.map((o) => o.id);
  const sellerIds = [...new Set(orderList.map((o) => o.seller_id))];

  const [{ data: lineItems }, { data: sellers }] = await Promise.all([
    service.from("order_line_items").select("order_id, product_name, quantity, unit_price").in("order_id", orderIds),
    service.from("accounts").select("id, name").in("id", sellerIds),
  ]);

  const sellerName = new Map((sellers ?? []).map((s) => [s.id, s.name]));
  const itemMap = new Map<string, BranchOrderRow["items"]>();
  for (const item of lineItems ?? []) {
    const list = itemMap.get(item.order_id) ?? [];
    list.push({ product_name: item.product_name, quantity: item.quantity, unit_price: Number(item.unit_price) });
    itemMap.set(item.order_id, list);
  }

  return orderList.map((o) => {
    const items = itemMap.get(o.id) ?? [];
    return {
      id: o.id,
      order_reference: o.order_reference,
      supplier_name: sellerName.get(o.seller_id) ?? null,
      status: o.status,
      placed_at: o.placed_at,
      total: items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0),
      items,
    };
  });
}

export interface BranchTransaction {
  id: string;
  kind: "sale" | "order_payment";
  description: string;
  amount: number;
  operator_name: string | null;
  created_at: string;
}

export async function getBranchTransactions(): Promise<BranchTransaction[]> {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) return [];

  const service = await createServiceClient();
  const branchId = session.branch.id;

  const { data: sales } = await service
    .from("sales")
    .select("id, total, operator_id, created_at")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: payments } = await service
    .from("payments")
    .select("id, amount_tzs, status, reference, created_at, order_id, orders(buyer_branch_id, order_reference)")
    .eq("orders.buyer_branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(100);

  const salesList = (sales ?? []) as Array<{
    id: string;
    total: number;
    operator_id: string | null;
    created_at: string;
  }>;

  // Resolve operator names (avoid relying on FK embed naming).
  const operatorIds = [...new Set(salesList.filter((s) => s.operator_id).map((s) => s.operator_id as string))];
  const operatorNames = new Map<string, string>();
  if (operatorIds.length > 0) {
    const { data: ops } = await service.from("operators").select("id, name").in("id", operatorIds);
    for (const op of ops ?? []) operatorNames.set(op.id, op.name);
  }

  const transactions: BranchTransaction[] = [];

  for (const sale of salesList) {
    transactions.push({
      id: `sale-${sale.id}`,
      kind: "sale",
      description: "POS sale",
      amount: Number(sale.total),
      operator_name: sale.operator_id ? (operatorNames.get(sale.operator_id) ?? null) : null,
      created_at: sale.created_at,
    });
  }

  for (const pay of (payments ?? []) as Array<{
    id: string;
    amount_tzs: number;
    status: string;
    reference: string;
    created_at: string;
    orders: { order_reference: string }[] | null;
  }>) {
    if (pay.status === "completed" || pay.status === "pending") {
      transactions.push({
        id: `pay-${pay.id}`,
        kind: "order_payment",
        description: `Marketplace payment — ${pay.orders?.[0]?.order_reference ?? pay.reference}`,
        amount: Number(pay.amount_tzs),
        operator_name: null,
        created_at: pay.created_at,
      });
    }
  }

  return transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getBranchProducts(): Promise<{ id: string; name: string }[]> {
  const service = await createServiceClient();
  const { data } = await service.from("products").select("id, generic_name, brand_name").order("generic_name");
  return ((data ?? []) as unknown as Array<{ id: string; generic_name: string; brand_name: string | null }>).map(
    (p) => ({ id: p.id, name: [p.generic_name, p.brand_name].filter(Boolean).join(" — ") || "Product" })
  );
}

export async function addBranchBatch(input: {
  productId: string;
  quantity: number;
  expiryDate: string;
  costPrice?: number;
  salePrice?: number;
}): Promise<{ error: string | null }> {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) return { error: error ?? "Operator access required." };

  const qty = Math.floor(Number(input.quantity));
  if (!input.productId || !Number.isFinite(qty) || qty <= 0) return { error: "Enter a valid quantity." };
  if (!input.expiryDate) return { error: "Expiry date is required." };

  const service = await createServiceClient();
  const { error: insertError } = await service.from("batches").insert({
    branch_id: session.branch.id,
    product_id: input.productId,
    quantity: qty,
    expiry_date: input.expiryDate,
    cost_price: Number(input.costPrice) || 0,
    sale_price: Number(input.salePrice) || 0,
  });

  return { error: insertError?.message ?? null };
}

/** Delta-based stock adjustment (positive = stock-in, negative = stock-out). */
export async function adjustBranchBatch(
  batchId: string,
  delta: number,
  reason: string
): Promise<{ error: string | null; quantity: number | null }> {
  const { data: session, error } = await requireBranchOperator();
  if (error || !session) return { error: error ?? "Operator access required.", quantity: null };

  const service = await createServiceClient();
  const { data: batch } = await service
    .from("batches")
    .select("id, quantity")
    .eq("id", batchId)
    .eq("branch_id", session.branch.id)
    .single();

  if (!batch) return { error: "Batch not found.", quantity: null };
  const deltaN = Math.floor(Number(delta));
  if (!Number.isFinite(deltaN) || deltaN === 0) return { error: "Invalid adjustment.", quantity: null };

  const next = Math.max(0, Number(batch.quantity) + deltaN);
  const { error: updateError } = await service
    .from("batches")
    .update({ quantity: next, updated_at: new Date().toISOString() })
    .eq("id", batchId);

  return { error: updateError?.message ?? null, quantity: next };
}