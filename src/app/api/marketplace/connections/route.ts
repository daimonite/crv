import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getPlans, isSubscribedActive } from "@/lib/subscription";

/**
 * GET /api/marketplace/connections?branchId=...   (POS Admin / pharmacy side)
 * GET /api/marketplace/connections                (supplier side — all of their requests)
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = await createServiceClient();
  const { data: account } = await service
    .from("accounts")
    .select("id, type")
    .eq("auth_user_id", user.id)
    .single();
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const branchId = request.nextUrl.searchParams.get("branchId");

  if (account.type === "supplier") {
    const { data, error } = await service
      .from("branch_supplier_connections")
      .select("id, branch_id, status, requested_at, decided_at, branches(name, accounts!account_id(name))")
      .eq("supplier_id", account.id)
      .order("requested_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as unknown as {
      id: string;
      branch_id: string;
      status: string;
      requested_at: string;
      decided_at: string | null;
      branches: { name: string; accounts: { name: string }[] | null }[] | null;
    }[];
    return NextResponse.json({
      connections: rows.map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        branchName: r.branches?.[0]?.name ?? "Branch",
        pharmacyName: r.branches?.[0]?.accounts?.[0]?.name ?? "",
        status: r.status,
        requestedAt: r.requested_at,
        decidedAt: r.decided_at,
      })),
    });
  }

  // Pharmacy / POS Admin side — must own the branch being queried
  if (!branchId) return NextResponse.json({ error: "branchId is required." }, { status: 400 });
  const { data: branch } = await service.from("branches").select("id, account_id").eq("id", branchId).single();
  if (!branch || branch.account_id !== account.id) {
    return NextResponse.json({ error: "Branch not found or access denied." }, { status: 403 });
  }

  const { data, error } = await service
    .from("branch_supplier_connections")
    .select("id, supplier_id, status, requested_at, decided_at, accounts!supplier_id(name)")
    .eq("branch_id", branchId)
    .order("requested_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as { id: string; supplier_id: string; status: string; requested_at: string; decided_at: string | null; accounts: { name: string }[] | null }[];
  return NextResponse.json({
    connections: rows.map((r) => ({
      id: r.id, supplierId: r.supplier_id, supplierName: r.accounts?.[0]?.name ?? "Supplier",
      status: r.status, requestedAt: r.requested_at, decidedAt: r.decided_at,
    })),
  });
}

/**
 * POST /api/marketplace/connections   (supplier side — request a branch)
 * Body: { branchId: string }
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = await createServiceClient();
  const { data: account } = await service
    .from("accounts")
    .select("id, type")
    .eq("auth_user_id", user.id)
    .single();
  if (!account || account.type !== "supplier") {
    return NextResponse.json({ error: "Only supplier accounts can request a branch connection." }, { status: 403 });
  }

  // Seller subscription gate: an approved connection requires an active plan.
  const { data: acct } = await service
    .from("accounts")
    .select("id, subscription_status, subscription_expires_at, subscription_plan")
    .eq("id", account.id)
    .single();
  const active = isSubscribedActive(acct ?? {});
  if (!active) {
    return NextResponse.json(
      { error: "Your supplier subscription has expired. Renew it to connect pharmacies.", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 }
    );
  }

  let body: { branchId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.branchId) return NextResponse.json({ error: "branchId is required." }, { status: 400 });

  const { data: branch } = await service.from("branches").select("id").eq("id", body.branchId).single();
  if (!branch) return NextResponse.json({ error: "Branch not found." }, { status: 404 });

  // Enforce the plan's connected-pharmacy cap.
  const { data: plans } = await getPlans(service, "supplier");
  const plan = plans?.find((p) => p.id === acct?.subscription_plan) ?? plans?.[0];
  const cap = plan?.max_connected_pharmacies ?? 0;
  if (cap > 0) {
    const { count } = await service
      .from("branch_supplier_connections")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", account.id)
      .eq("status", "approved");
    if ((count ?? 0) >= cap) {
      return NextResponse.json(
        {
          error: `Plan limit reached — you can connect up to ${cap} pharmacies. Upgrade your supplier plan to add more.`,
          code: "CONNECTION_LIMIT",
        },
        { status: 402 }
      );
    }
  }

  // Re-request after a rejection is allowed (flips back to pending); an existing
  // pending/approved row is left alone rather than duplicated (UNIQUE constraint).
  const { data: existing } = await service
    .from("branch_supplier_connections")
    .select("id, status")
    .eq("branch_id", body.branchId)
    .eq("supplier_id", account.id)
    .maybeSingle();

  if (existing && existing.status !== "rejected") {
    return NextResponse.json({ connectionId: existing.id, status: existing.status });
  }

  if (existing) {
    const { error } = await service
      .from("branch_supplier_connections")
      .update({ status: "pending", requested_at: new Date().toISOString(), decided_at: null })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ connectionId: existing.id, status: "pending" });
  }

  const { data: inserted, error } = await service
    .from("branch_supplier_connections")
    .insert({ branch_id: body.branchId, supplier_id: account.id, status: "pending" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connectionId: inserted.id, status: "pending" });
}

/**
 * PATCH /api/marketplace/connections   (POS Admin / pharmacy side — approve or reject)
 * Body: { connectionId: string, status: 'approved' | 'rejected' }
 */
export async function PATCH(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const service = await createServiceClient();
  const { data: account } = await service
    .from("accounts")
    .select("id, type")
    .eq("auth_user_id", user.id)
    .single();
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  let body: { connectionId?: string; status?: "approved" | "rejected" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.connectionId || (body.status !== "approved" && body.status !== "rejected")) {
    return NextResponse.json({ error: "connectionId and a valid status are required." }, { status: 400 });
  }

  const { data: conn } = await service
    .from("branch_supplier_connections")
    .select("id, branch_id, branches(account_id)")
    .eq("id", body.connectionId)
    .single();
  if (!conn) return NextResponse.json({ error: "Connection request not found." }, { status: 404 });

  const branchAccountId = (conn as unknown as { branches: { account_id: string }[] | null }).branches?.[0]?.account_id;
  if (branchAccountId !== account.id) {
    return NextResponse.json({ error: "Only the branch's own account can approve or reject this request." }, { status: 403 });
  }

  if (body.status === "approved") {
    // Pharmacy subscription gate + connected-supplier cap from their pharmacy plan.
    const { data: acct } = await service
      .from("accounts")
      .select("id, subscription_status, subscription_expires_at, subscription_plan")
      .eq("id", account.id)
      .single();
    const active = isSubscribedActive(acct ?? {});
    if (!active) {
      return NextResponse.json(
        { error: "Your pharmacy subscription has expired. Renew it to approve supplier connections.", code: "SUBSCRIPTION_REQUIRED" },
        { status: 403 }
      );
    }

    const { data: plans } = await getPlans(service, "pharmacy");
    const plan = plans?.find((p) => p.id === acct?.subscription_plan) ?? plans?.[0];
    const cap = plan?.max_suppliers ?? 0;
    const { data: branches } = await service
      .from("branches")
      .select("id")
      .eq("account_id", account.id);
    const branchIds = (branches ?? []).map((b) => b.id);
    const { count } = await service
      .from("branch_supplier_connections")
      .select("id", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .eq("status", "approved");
    if (cap > 0 && (count ?? 0) >= cap) {
      return NextResponse.json(
        {
          error: `Plan limit reached — you can connect up to ${cap} suppliers on your current pharmacy plan. Upgrade to add more.`,
          code: "CONNECTION_LIMIT",
        },
        { status: 402 }
      );
    }
  }

  const { error } = await service
    .from("branch_supplier_connections")
    .update({ status: body.status, decided_at: new Date().toISOString() })
    .eq("id", body.connectionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
