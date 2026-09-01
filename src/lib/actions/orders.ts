"use server";

import { createClient } from "@/lib/supabase/server";

export interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  order_reference: string;
  buyer_branch_id: string;
  branch_name: string | null;
  supplier_id: string;
  supplier_name: string | null;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  total: number;
  placed_at: string | null;
}

export interface OrderDetail extends Order {
  order_items: OrderItem[];
}

type OrderRow = {
  id: string;
  order_reference: string;
  buyer_branch_id: string;
  seller_id: string;
  status: string;
  placed_at: string | null;
};

async function hydrateOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderRows: OrderRow[]
): Promise<Order[]> {
  if (orderRows.length === 0) return [];

  const branchIds = [...new Set(orderRows.map((o) => o.buyer_branch_id))];
  const sellerIds = [...new Set(orderRows.map((o) => o.seller_id))];
  const orderIds = orderRows.map((o) => o.id);

  const [{ data: branches }, { data: sellers }, { data: lineItems }] = await Promise.all([
    supabase.from("branches").select("id, name").in("id", branchIds),
    supabase.from("accounts").select("id, name").in("id", sellerIds),
    supabase.from("order_line_items").select("order_id, quantity, unit_price").in("order_id", orderIds),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const sellerName = new Map((sellers ?? []).map((s) => [s.id, s.name]));
  const totals = new Map<string, number>();
  for (const item of lineItems ?? []) {
    totals.set(item.order_id, (totals.get(item.order_id) ?? 0) + Number(item.quantity) * Number(item.unit_price));
  }

  return orderRows.map((o) => ({
    id: o.id,
    order_reference: o.order_reference,
    buyer_branch_id: o.buyer_branch_id,
    branch_name: branchName.get(o.buyer_branch_id) ?? null,
    supplier_id: o.seller_id,
    supplier_name: sellerName.get(o.seller_id) ?? null,
    status: o.status as Order["status"],
    total: totals.get(o.id) ?? 0,
    placed_at: o.placed_at,
  }));
}

/** Orders for all branches of a pharmacy account, newest first. */
export async function getOrders(accountId: string): Promise<Order[]> {
  const supabase = await createClient();

  const { data: branches } = await supabase.from("branches").select("id").eq("account_id", accountId);
  const branchIds = (branches ?? []).map((b) => b.id);
  if (branchIds.length === 0) return [];

  const { data } = await supabase
    .from("orders")
    .select("id, order_reference, buyer_branch_id, seller_id, status, placed_at")
    .in("buyer_branch_id", branchIds)
    .order("placed_at", { ascending: false });

  return hydrateOrders(supabase, (data ?? []) as unknown as OrderRow[]);
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_reference, buyer_branch_id, seller_id, status, placed_at")
    .eq("id", orderId)
    .single();

  if (!order) return null;

  const [hydrated] = await hydrateOrders(supabase, [order] as unknown as OrderRow[]);
  if (!hydrated) return null;

  const { data: items } = await supabase
    .from("order_line_items")
    .select("id, order_id, product_name, quantity, unit_price")
    .eq("order_id", orderId);

  return {
    ...hydrated,
    order_items: (items ?? []) as OrderItem[],
  };
}