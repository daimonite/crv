import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: {
    buyerBranchId?: string;
    items?: { catalogId: string; quantity: number }[];
    note?: string;
    msisdn?: string;
    idempotencyKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { buyerBranchId, items, note, msisdn } = body;
  if (!buyerBranchId || !items || items.length === 0) {
    return NextResponse.json({ error: "buyerBranchId and items are required" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Validate buyer branch belongs to caller's account
  const { data: account } = await service
    .from("accounts")
    .select("id, type, name, payme_wallet_number, subscription_status, subscription_expires_at")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (account.type === "supplier") {
    return NextResponse.json({ error: "Supplier accounts cannot place orders." }, { status: 403 });
  }

  // Subscription gate: placing orders requires an active/mid-trial subscription.
  const subActive =
    account.subscription_status === "active" ||
    account.subscription_status === "trial" ||
    (account.subscription_expires_at && new Date(account.subscription_expires_at) > new Date());
  if (!subActive) {
    return NextResponse.json(
      { error: "Your subscription has expired. Renew it from Billing to keep ordering.", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 }
    );
  }

  const { data: branch } = await service
    .from("branches")
    .select("id, account_id")
    .eq("id", buyerBranchId)
    .single();

  if (!branch || branch.account_id !== account.id) {
    return NextResponse.json({ error: "Branch not found or access denied." }, { status: 403 });
  }

  // Fetch catalog rows to validate prices and seller
  const catalogIds = items.map((i) => i.catalogId);
  const { data: catalogRows, error: catalogError } = await service
    .from("supplier_catalog")
    .select("id, supplier_id, price, currency, min_order_qty, stock_qty, status, products(id, generic_name, brand_name)")
    .in("id", catalogIds)
    .eq("status", "active");

  if (catalogError) {
    return NextResponse.json({ error: catalogError.message }, { status: 500 });
  }

  if (!catalogRows || catalogRows.length !== catalogIds.length) {
    return NextResponse.json({ error: "One or more products not found or not available." }, { status: 400 });
  }

  // Enforce single seller per order
  const sellerIds = [...new Set(catalogRows.map((r) => r.supplier_id))];
  if (sellerIds.length !== 1) {
    return NextResponse.json({ error: "All items must be from the same supplier." }, { status: 400 });
  }
  const sellerId = sellerIds[0] as string;

  // Browsing the marketplace is open to everyone, but placing an order requires
  // the branch to have an approved connection with this supplier.
  const { data: connection } = await service
    .from("branch_supplier_connections")
    .select("status")
    .eq("branch_id", buyerBranchId)
    .eq("supplier_id", sellerId)
    .maybeSingle();

  if (!connection || connection.status !== "approved") {
    return NextResponse.json(
      {
        error: connection?.status === "pending"
          ? "Connection request to this supplier is pending approval. Approve it in Network Map."
          : "This branch isn't connected to this supplier yet. In the supplier portal, go to Connections and send a request to this branch, then approve it under Network Map.",
        code: "CONNECTION_REQUIRED",
      },
      { status: 403 }
    );
  }

  const priceMap = new Map(catalogRows.map((r) => [r.id, r] as const));
  let total = 0;
  const lineItems: { catalogId: string; quantity: number; unitPrice: number; productName: string; productId: string | null }[] = [];

  for (const item of items) {
    const row = priceMap.get(item.catalogId) as unknown as { price: number; min_order_qty: number; products: { id: string; generic_name: string; brand_name: string | null } | null } | undefined;
    if (!row) return NextResponse.json({ error: `Catalog item ${item.catalogId} not found` }, { status: 400 });
    if (item.quantity < row.min_order_qty) {
      return NextResponse.json({ error: `Quantity for ${item.catalogId} below minimum ${row.min_order_qty}` }, { status: 400 });
    }
    const unitPrice = Number(row.price);
    total += unitPrice * item.quantity;
    const productName = row.products?.brand_name ?? row.products?.generic_name ?? "Product";
    lineItems.push({ catalogId: item.catalogId, quantity: item.quantity, unitPrice, productName, productId: row.products?.id ?? null });
  }

  const orderId = crypto.randomUUID();
  const orderRef = `ORD-${Date.now().toString(36).toUpperCase()}`;

  const { error: orderError } = await service.from("orders").insert({
    id: orderId,
    order_reference: orderRef,
    buyer_branch_id: buyerBranchId,
    seller_id: sellerId,
    currency: "TZS",
    status: "pending",
    note: note ?? null,
    placed_at: new Date().toISOString(),
  });

  if (orderError) {
    console.error("[marketplace/checkout] order insert error:", orderError);
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const dbLineItems = lineItems.map((item) => ({
    id: crypto.randomUUID(),
    order_id: orderId,
    product_id: item.productId,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));

  const { error: lineError } = await service.from("order_line_items").insert(dbLineItems);
  if (lineError) {
    console.error("[marketplace/checkout] line items error:", lineError);
    return NextResponse.json({ error: lineError.message }, { status: 500 });
  }

  // No payment is taken here. The order sits at `pending` with
  // supplier_approved_at = NULL until the supplier approves it
  // (src/lib/actions/supplier.ts:approveOrderForPayment). Only then can the
  // pharmacy pay — via /api/marketplace/pay-order — using this wallet number
  // (kept for reference/prefill, not charged now).
  const walletMsisdn = (
    msisdn?.trim() ||
    (account as unknown as { payme_wallet_number?: string }).payme_wallet_number ||
    ""
  ).trim();

  return NextResponse.json({
    orderId,
    orderRef,
    total,
    walletMsisdn: walletMsisdn || null,
    payment: null,
    message: "Order sent to the supplier for approval. You'll be able to pay once they approve it.",
  });
}
