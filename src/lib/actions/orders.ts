"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  /** Current stock on the supplier's catalog for this product, when linked (evidence for the receipt). */
  stock_available: number | null;
}

export interface Order {
  id: string;
  order_reference: string;
  buyer_branch_id: string;
  branch_name: string | null;
  supplier_id: string;
  supplier_name: string | null;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  supplier_approved_at: string | null;
  total: number;
  placed_at: string | null;
}

/** One milestone in an order's lifecycle, for the receipt's order-history trail. */
export interface OrderHistoryEntry {
  key: "placed" | "approved" | "confirmed" | "shipped" | "delivered" | "cancelled";
  label: string;
  at: string | null;
}

/** Payment/payout evidence shown on the receipt once an order has been paid. */
export interface OrderReceipt {
  payment: {
    reference: string;
    status: string;
    transactionId: string | null;
    amountTzs: number;
    completedAt: string | null;
  } | null;
  disbursement: {
    reference: string;
    status: string;
    completedAt: string | null;
  } | null;
}

export interface OrderDetail extends Order {
  order_items: OrderItem[];
  history: OrderHistoryEntry[];
  receipt: OrderReceipt;
}

type OrderRow = {
  id: string;
  order_reference: string;
  buyer_branch_id: string;
  seller_id: string;
  status: string;
  supplier_approved_at: string | null;
  placed_at: string | null;
};

async function hydrateOrders(
  supabase: SupabaseClient,
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
    supplier_approved_at: o.supplier_approved_at,
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
    .select("id, order_reference, buyer_branch_id, seller_id, status, supplier_approved_at, placed_at")
    .in("buyer_branch_id", branchIds)
    .order("placed_at", { ascending: false });

  return hydrateOrders(supabase, (data ?? []) as unknown as OrderRow[]);
}

/**
 * Full receipt view of a single order: line items (with current supplier
 * stock as evidence), the full status history trail, and payment/payout
 * evidence once paid. `payments`/`disbursements` are service-role-only
 * tables, so this resolves the caller's identity via the cookie-bound
 * client first and manually checks they're a party to the order (buyer
 * branch owner or the seller) before using the service client to read them.
 */
export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;

  const service = await createServiceClient();

  const { data: account } = await service
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!account) return null;

  const { data: order } = await service
    .from("orders")
    .select("id, order_reference, buyer_branch_id, seller_id, status, supplier_approved_at, placed_at, approved_at, confirmed_at, shipped_at, delivered_at, cancelled_at")
    .eq("id", orderId)
    .single();
  if (!order) return null;

  const { data: branch } = await service
    .from("branches")
    .select("account_id")
    .eq("id", order.buyer_branch_id)
    .maybeSingle();

  const isBuyer = branch?.account_id === account.id;
  const isSeller = order.seller_id === account.id;
  if (!isBuyer && !isSeller) return null; // not a party to this order

  const [hydrated] = await hydrateOrders(service, [order] as unknown as OrderRow[]);
  if (!hydrated) return null;

  const { data: items } = await service
    .from("order_line_items")
    .select("id, order_id, product_id, product_name, quantity, unit_price")
    .eq("order_id", orderId);

  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter((id): id is string => !!id))];
  const { data: catalogRows } = productIds.length
    ? await service
        .from("supplier_catalog")
        .select("product_id, stock_qty")
        .eq("supplier_id", order.seller_id)
        .in("product_id", productIds)
    : { data: [] as { product_id: string; stock_qty: number }[] };

  const stockByProduct = new Map((catalogRows ?? []).map((r) => [r.product_id, r.stock_qty]));

  const orderItems: OrderItem[] = (items ?? []).map((i) => ({
    id: i.id,
    order_id: i.order_id,
    product_name: i.product_name,
    quantity: i.quantity,
    unit_price: Number(i.unit_price),
    stock_available: i.product_id ? stockByProduct.get(i.product_id) ?? null : null,
  }));

  const history: OrderHistoryEntry[] = (
    [
      { key: "placed", label: "Order placed", at: order.placed_at },
      { key: "approved", label: "Approved by supplier", at: order.approved_at },
      { key: "confirmed", label: "Paid & confirmed", at: order.confirmed_at },
      { key: "shipped", label: "Shipped", at: order.shipped_at },
      { key: "delivered", label: "Delivered", at: order.delivered_at },
      { key: "cancelled", label: "Cancelled", at: order.cancelled_at },
    ] as OrderHistoryEntry[]
  ).filter((h) => h.at !== null || h.key === "placed");

  const { data: payment } = await service
    .from("payments")
    .select("reference, status, provider_transaction_id, amount_tzs, completed_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: disbursement } = await service
    .from("disbursements")
    .select("reference, status, completed_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ...hydrated,
    order_items: orderItems,
    history,
    receipt: {
      payment: payment
        ? {
            reference: payment.reference,
            status: payment.status,
            transactionId: payment.provider_transaction_id,
            amountTzs: Number(payment.amount_tzs),
            completedAt: payment.completed_at,
          }
        : null,
      disbursement: disbursement
        ? {
            reference: disbursement.reference,
            status: disbursement.status,
            completedAt: disbursement.completed_at,
          }
        : null,
    },
  };
}
