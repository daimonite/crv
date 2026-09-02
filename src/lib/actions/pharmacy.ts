/**
 * @file lib/actions/pharmacy.ts
 * @description Server actions for the pharmacy portal dashboard.
 *
 * Supabase tables touched:
 *   - accounts  — read (id, name, billing_status, download_enabled, type)
 *   - branches  — read (all branch fields including lat/lng for map)
 *   - batches   — read near-expiry batches (joined with products, branches)
 *
 * Uses the anon-key Supabase client — all queries are scoped to the
 * authenticated user via `auth_user_id` on the accounts table.
 * Row Level Security on Supabase enforces the user ↔ account boundary.
 *
 * @environment NEXT_PUBLIC_SUPABASE_URL
 * @environment NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Fetches everything the pharmacy dashboard needs in a single server action:
 * the account row, all branches, and near-expiry batches (within 30 days).
 *
 * Returns null if no authenticated user or no matching account row.
 *
 * @returns `{ account, branches, expiringBatches }` or null if unauthenticated
 */
export async function getPharmacyDashboardData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, billing_status, download_enabled, type")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const [branchesRes, batchesRes] = await Promise.all([
    supabase
      .from("branches")
      .select(
        "id, name, subscription_status, trial_ends_at, grace_ends_at, last_synced_at, lat, lng"
      )
      .eq("account_id", account.id)
      .order("name"),
    supabase
      .from("batches")
      .select(
        "id, quantity, expiry_date, product_id, branch_id, products(generic_name, brand_name), branches!inner(name, account_id)"
      )
      .eq("branches.account_id", account.id)
      .lte("expiry_date", cutoffStr)
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true })
      .limit(10),
  ]);

  return {
    account,
    branches: branchesRes.data ?? [],
    expiringBatches: batchesRes.data ?? [],
  };
}

export async function selectPlan(
  planId: string
): Promise<{ error: string | null; suspendedBranchIds?: string[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return { error: "Account not found." };

  const { error } = await supabase
    .from("accounts")
    .update({ subscription_plan: planId })
    .eq("id", account.id);

  if (error) return { error: error.message };

  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("max_branches")
    .eq("id", planId)
    .maybeSingle();

  let suspendedBranchIds: string[] = [];

  if (plan && typeof plan.max_branches === "number" && plan.max_branches > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: true });

    const branchList = (branches ?? []) as Array<{ id: string; created_at: string }>;
    if (branchList.length > plan.max_branches) {
      const excess = branchList.slice(0, branchList.length - plan.max_branches);
      const idsToLock = excess.map((b) => b.id);

      await supabase
        .from("branches")
        .update({ subscription_status: "locked", locked_reason: "max_branches_exceeded" })
        .in("id", idsToLock);

      suspendedBranchIds = idsToLock;
    }
  }

  return { error: null, suspendedBranchIds };
}

// ═══════════════════════════════════════════════════════════════════════
// Pharmacy Alerts — branch-level alerts for the pharmacy portal
// ═══════════════════════════════════════════════════════════════════════

export interface PharmacyAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  category: "expiry" | "stock" | "sync" | "subscription" | "branch";
  title: string;
  description: string;
  count: number;
  branchId?: string;
  branchName?: string;
  route: string;
  createdAt: string;
}

export async function getPharmacyAlerts(): Promise<{ data: PharmacyAlert[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: "Not authenticated." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, subscription_status, billing_status, subscription_plan")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return { data: [], error: "Account not found." };

  const alerts: PharmacyAlert[] = [];
  const now = Date.now();
  const dayMs = 86400000;

  try {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name, subscription_status, trial_ends_at, grace_ends_at, last_synced_at, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: true });

    const branchList = (branches ?? []) as Array<{
      id: string; name: string; subscription_status: string;
      trial_ends_at: string | null; grace_ends_at: string | null;
      last_synced_at: string | null; created_at: string;
    }>;
    const branchIds = branchList.map(b => b.id);

    if (branchIds.length === 0) {
      return { data: [], error: null };
    }

    const { data: batches } = await supabase
      .from("batches")
      .select("id, branch_id, product_id, quantity, expiry_date, products(generic_name)")
      .in("branch_id", branchIds);

    const batchList = (batches ?? []) as unknown as Array<{
      id: string; branch_id: string; product_id: string; quantity: number;
      expiry_date: string | null; products: { generic_name: string } | null;
    }>;

    // 1. CRITICAL — Already expired batches
    const expired: typeof batchList = [];
    const expiring7d: typeof batchList = [];
    const expiring30d: typeof batchList = [];

    for (const bat of batchList) {
      if (!bat.expiry_date) continue;
      const expMs = new Date(bat.expiry_date).getTime();
      if (expMs < now && bat.quantity > 0) expired.push(bat);
      else if (expMs - now < 7 * dayMs && bat.quantity > 0) expiring7d.push(bat);
      else if (expMs - now < 30 * dayMs && bat.quantity > 0) expiring30d.push(bat);
    }

    if (expired.length > 0) {
      const branchesAffected = [...new Set(expired.map(b => b.branch_id))];
      const branchNames = branchesAffected.map(bid => branchList.find(b => b.id === bid)?.name).filter(Boolean).slice(0, 3);
      alerts.push({
        id: "pharm-expired",
        severity: "critical",
        category: "expiry",
        title: `${expired.length} expired batch${expired.length > 1 ? "es" : ""}`,
        description: `Disposal required. At: ${branchNames.join(", ")}${branchesAffected.length > 3 ? "…" : ""}`,
        count: expired.length,
        route: "/dashboard/inventory",
        createdAt: new Date().toISOString(),
      });
    }

    if (expiring7d.length > 0) {
      const branchesAffected = [...new Set(expiring7d.map(b => b.branch_id))];
      alerts.push({
        id: "pharm-expiry-7d",
        severity: "critical",
        category: "expiry",
        title: `${expiring7d.length} batches expiring within 7 days`,
        description: "FEFO reallocation needed now to prevent losses.",
        count: expiring7d.length,
        route: "/dashboard/inventory",
        createdAt: new Date().toISOString(),
      });
    }

    if (expiring30d.length > 0) {
      alerts.push({
        id: "pharm-expiry-30d",
        severity: "warning",
        category: "expiry",
        title: `${expiring30d.length} batches expiring within 30 days`,
        description: "Review and plan FEFO rotation.",
        count: expiring30d.length,
        route: "/dashboard/inventory",
        createdAt: new Date().toISOString(),
      });
    }

    // 2. CRITICAL — Out of stock
    const outOfStock = batchList.filter(b => b.quantity === 0);
    if (outOfStock.length > 0) {
      const products = [...new Set(outOfStock.map(b => {
        const p = Array.isArray(b.products) ? b.products[0] : b.products;
        return p?.generic_name;
      }).filter(Boolean))];
      alerts.push({
        id: "pharm-oos",
        severity: "critical",
        category: "stock",
        title: `${outOfStock.length} out-of-stock batch${outOfStock.length > 1 ? "es" : ""}`,
        description: products.slice(0, 5).join(", ") + (products.length > 5 ? "…" : ""),
        count: outOfStock.length,
        route: "/dashboard/inventory",
        createdAt: new Date().toISOString(),
      });
    }

    // 3. SYNC — stale branches (no sync in 7+ days)
    const staleBranches = branchList.filter(b => {
      if (!b.last_synced_at) return true;
      return now - new Date(b.last_synced_at).getTime() > 7 * dayMs;
    });
    if (staleBranches.length > 0) {
      alerts.push({
        id: "pharm-sync-stale",
        severity: "warning",
        category: "sync",
        title: `${staleBranches.length} branch${staleBranches.length > 1 ? "es" : ""} not synced in 7+ days`,
        description: "Desktop app may be offline. Open to restore connection.",
        count: staleBranches.length,
        route: "/dashboard",
        createdAt: new Date().toISOString(),
      });
    }

    // 4. SUBSCRIPTION — account-level issues
    if (account.subscription_status === "locked") {
      alerts.push({
        id: "pharm-locked",
        severity: "critical",
        category: "subscription",
        title: "Account is locked",
        description: "Subscription payment is overdue. Branch access is restricted.",
        count: 1,
        route: "/dashboard/billing",
        createdAt: new Date().toISOString(),
      });
    } else if (account.subscription_status === "grace") {
      alerts.push({
        id: "pharm-grace",
        severity: "critical",
        category: "subscription",
        title: "Account in grace period",
        description: "Payment overdue. Resolve before the grace period ends to avoid lockout.",
        count: 1,
        route: "/dashboard/billing",
        createdAt: new Date().toISOString(),
      });
    } else if (account.subscription_status === "trial") {
      const trialBranch = branchList.find(b => b.trial_ends_at);
      if (trialBranch && trialBranch.trial_ends_at) {
        const daysLeft = Math.ceil((new Date(trialBranch.trial_ends_at).getTime() - now) / dayMs);
        if (daysLeft <= 3) {
          alerts.push({
            id: "pharm-trial-ending",
            severity: "warning",
            category: "subscription",
            title: `Trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
            description: "Subscribe to a plan to avoid service interruption.",
            count: daysLeft,
            route: "/dashboard/billing",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    // 5. INFO — Low stock warning (quantity < 10)
    const lowStock = batchList.filter(b => b.quantity > 0 && b.quantity < 10);
    if (lowStock.length > 0) {
      alerts.push({
        id: "pharm-low-stock",
        severity: "info",
        category: "stock",
        title: `${lowStock.length} low-stock batch${lowStock.length > 1 ? "es" : ""}`,
        description: "Consider reordering soon.",
        count: lowStock.length,
        route: "/dashboard/inventory",
        createdAt: new Date().toISOString(),
      });
    }

    // 6. INFO — New branch just created (within 7 days)
    const newBranches = branchList.filter(b => {
      return now - new Date(b.created_at).getTime() < 7 * dayMs;
    });
    if (newBranches.length > 0) {
      alerts.push({
        id: "pharm-new-branch",
        severity: "info",
        category: "branch",
        title: `${newBranches.length} new branch${newBranches.length > 1 ? "es" : ""} this week`,
        description: "Welcome! Set up your desktop app at each branch.",
        count: newBranches.length,
        route: "/dashboard/branches",
        createdAt: new Date().toISOString(),
      });
    }

  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load alerts." };
  }

  return { data: alerts, error: null };
}

export interface PharmacyNotification {
  id: string;
  kind: "info" | "warning" | "urgent" | "promo";
  title: string;
  body: string;
  created_at: string;
  read: boolean;
}

export async function getPharmacyNotifications(): Promise<{ data: PharmacyNotification[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: "Not authenticated." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return { data: [], error: "Account not found." };

  try {
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, created_at, read")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { data: [], error: error.message };

    const result: PharmacyNotification[] = (notifications ?? []).map((n) => ({
      id: n.id,
      kind: n.kind ?? "info",
      title: n.title ?? "",
      body: n.body ?? "",
      created_at: n.created_at,
      read: Boolean(n.read),
    }));

    return { data: result, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load notifications." };
  }
}
