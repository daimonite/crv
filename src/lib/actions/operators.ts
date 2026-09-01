"use server";

import { createClient } from "@/lib/supabase/server";

export interface Operator {
  id: string;
  name: string;
  pin_hash: string;
  role: "admin" | "operator";
  branch_id: string;
  branch_name?: string;
  auth_user_id?: string | null;
  email?: string | null;
  web_enabled?: boolean;
  created_at?: string;
}

export interface CreateOperatorInput {
  name: string;
  pin: string;
  role: "admin" | "operator";
  branch_id: string;
  /** Web-login email — when provided the operator is granted branch-portal access. */
  email?: string;
  password?: string;
  web_enabled?: boolean;
}

export interface UpdateOperatorInput {
  name?: string;
  role?: "admin" | "operator";
  branch_id?: string;
  email?: string | null;
  password?: string;
  web_enabled?: boolean;
}

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export async function validatePin(pin: string): Promise<string | null> {
  if (!/^\d{4,8}$/.test(pin)) return "PIN must be 4-8 digits.";
  return null;
}

function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function accountBranchIds(supabase: Awaited<ReturnType<typeof createClient>>, accountId: string): Promise<string[]> {
  const { data: branches } = await supabase.from("branches").select("id").eq("account_id", accountId);
  return (branches ?? []).map((b) => b.id);
}

/** Number of operators currently provisioned to the account's branches. */
async function countAccountOperators(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  branchIds: string[]
): Promise<number> {
  if (branchIds.length === 0) return 0;
  const { count } = await supabase
    .from("operators")
    .select("id", { count: "exact", head: true })
    .in("branch_id", branchIds);
  return count ?? 0;
}

/** True when the account's pharmacy plan still has room for another operator. */
async function ensureOperatorCap(
  service: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  branchIds: string[]
): Promise<string | null> {
  const { data: account } = await service
    .from("accounts")
    .select("subscription_plan")
    .eq("id", accountId)
    .single();

  const { data: plans } = await service
    .from("subscription_plans")
    .select("id, name, max_operators, audience")
    .eq("audience", "pharmacy");

  const plan = (plans ?? []).find((p) => p.id === account?.subscription_plan) ?? null;
  const cap = plan?.max_operators ?? 0;
  if (cap <= 0) return null;

  const current = await countAccountOperators(service, accountId, branchIds);
  if (current >= cap) {
    return `Operator limit reached — your plan allows ${cap} operators. Upgrade from Billing to add more.`;
  }
  return null;
}

/** Creates a Supabase Auth login for a web operator. Returns { authUserId, error }. */
async function createAuthUser(email: string, password: string): Promise<{ authUserId: string | null; error: string | null }> {
  if (IS_MOCK) return { authUserId: null, error: null };
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return { authUserId: null, error: error.message };
    return { authUserId: data.user?.id ?? null, error: null };
  } catch (err) {
    return { authUserId: null, error: err instanceof Error ? err.message : "Failed to create web login." };
  }
}

/** Deletes the Supabase Auth user backing a web operator login. */
async function deleteAuthUser(authUserId: string | null | undefined): Promise<void> {
  if (!authUserId || IS_MOCK) return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    await admin.auth.admin.deleteUser(authUserId);
  } catch {
    // Auth cleanup is best-effort; the operator row removal still happens.
  }
}

export async function getOperators(accountId: string): Promise<Operator[]> {
  const supabase = await createClient();

  const branchIds = await accountBranchIds(supabase, accountId);
  if (branchIds.length === 0) return [];

  const { data } = await supabase
    .from("operators")
    .select("id, name, pin_hash, role, branch_id, created_at, auth_user_id, email, web_enabled, branches(name)")
    .in("branch_id", branchIds)
    .order("name");

  return ((data ?? []) as unknown as (Operator & { branches: { name: string }[] | null })[]).map((row) => ({
    id: row.id,
    name: row.name,
    pin_hash: row.pin_hash,
    role: row.role,
    branch_id: row.branch_id,
    auth_user_id: row.auth_user_id ?? null,
    email: row.email ?? null,
    web_enabled: row.web_enabled ?? false,
    created_at: row.created_at,
    branch_name: row.branches?.[0]?.name ?? "Unknown",
  }));
}

export async function createOperator(
  accountId: string,
  input: CreateOperatorInput
): Promise<{ error: string | null; operator?: Operator }> {
  const supabase = await createClient();

  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("id", input.branch_id)
    .eq("account_id", accountId)
    .single();

  if (!branch) return { error: "Branch not found or access denied." };

  const pinError = await validatePin(input.pin);
  if (pinError) return { error: pinError };

  const wantsWeb = !!(input.email && input.password && input.web_enabled);
  if (wantsWeb) {
    const emailError = validateEmail(input.email!);
    if (emailError) return { error: emailError };
    const passwordError = validatePassword(input.password!);
    if (passwordError) return { error: passwordError };

    const branchIds = await accountBranchIds(supabase, accountId);
    const userError = await ensureOperatorCap(supabase, accountId, branchIds);
    if (userError) return { error: userError };
  }

  const pinHash = await hashPin(input.pin);

  let authUserId: string | null = null;
  if (wantsWeb) {
    const created = await createAuthUser(input.email!, input.password!);
    if (created.error) return { error: created.error };
    authUserId = created.authUserId;
  }

  const insert: Record<string, unknown> = {
    name: input.name,
    pin_hash: pinHash,
    role: input.role,
    branch_id: input.branch_id,
  };
  if (wantsWeb) {
    insert.web_enabled = true;
    insert.email = input.email;
    if (authUserId) insert.auth_user_id = authUserId;
  }

  const { data: created, error } = await supabase
    .from("operators")
    .insert(insert)
    .select("id, name, pin_hash, role, branch_id, created_at, auth_user_id, email, web_enabled, branches(name)")
    .single();

  if (error) {
    await deleteAuthUser(authUserId);
    return { error: error.message };
  }

  const row = created as unknown as (Operator & { branches: { name: string }[] | null }) | null;
  const operator: Operator | undefined = row
    ? {
        id: row.id,
        name: row.name,
        pin_hash: row.pin_hash,
        role: row.role,
        branch_id: row.branch_id,
        auth_user_id: row.auth_user_id ?? null,
        email: row.email ?? null,
        web_enabled: row.web_enabled ?? false,
        created_at: row.created_at,
        branch_name: row.branches?.[0]?.name ?? "Unknown",
      }
    : undefined;

  return { error: null, operator };
}

export async function updateOperator(
  id: string,
  accountId: string,
  input: UpdateOperatorInput
): Promise<{ error: string | null; operator?: Operator }> {
  const supabase = await createClient();

  const { data: op } = await supabase
    .from("operators")
    .select("branch_id, auth_user_id, email, web_enabled, branches(account_id)")
    .eq("id", id)
    .single();

  if (!op) return { error: "Operator not found." };

  const branchAccountId = (op.branches as unknown as { account_id: string } | null)?.account_id;
  if (branchAccountId !== accountId) return { error: "Access denied." };

  if (input.branch_id && input.branch_id !== op.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("id", input.branch_id)
      .eq("account_id", accountId)
      .single();

    if (!branch) return { error: "Branch not found or access denied." };
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.role !== undefined) updates.role = input.role;
  if (input.branch_id !== undefined) updates.branch_id = input.branch_id;

  // Web-login transitions.
  const currentlyWeb = op.web_enabled && !!op.auth_user_id;
  const wantsWeb = !!input.web_enabled && !!input.email;

  if (wantsWeb && !currentlyWeb) {
    const emailError = validateEmail(input.email!);
    if (emailError) return { error: emailError };
    if (input.password) {
      const passwordError = validatePassword(input.password!);
      if (passwordError) return { error: passwordError };
    }
    const created = await createAuthUser(input.email!, input.password ?? Math.random().toString(36).slice(-10) + "Aa1!");
    if (created.error) return { error: created.error };
    updates.auth_user_id = created.authUserId;
    updates.email = input.email;
    updates.web_enabled = true;
  } else if (input.web_enabled === false && currentlyWeb) {
    await deleteAuthUser(op.auth_user_id);
    updates.auth_user_id = null;
    updates.web_enabled = false;
  } else if (input.email && op.email !== input.email) {
    const emailError = validateEmail(input.email);
    if (emailError) return { error: emailError };
    updates.email = input.email;
  }

  if (input.password && currentlyWeb) {
    const passwordError = validatePassword(input.password!);
    if (passwordError) return { error: passwordError };
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(op.auth_user_id as string, { password: input.password });
      if (error) return { error: error.message };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to reset web password." };
    }
  }

  if (Object.keys(updates).length === 0) return { error: null };

  const { data: updated, error } = await supabase
    .from("operators")
    .update(updates)
    .eq("id", id)
    .select("id, name, pin_hash, role, branch_id, created_at, auth_user_id, email, web_enabled, branches(name)")
    .single();

  if (error) return { error: error.message };

  const row = updated as unknown as (Operator & { branches: { name: string }[] | null }) | null;
  const operator: Operator | undefined = row
    ? {
        id: row.id,
        name: row.name,
        pin_hash: row.pin_hash,
        role: row.role,
        branch_id: row.branch_id,
        auth_user_id: row.auth_user_id ?? null,
        email: row.email ?? null,
        web_enabled: row.web_enabled ?? false,
        created_at: row.created_at,
        branch_name: row.branches?.[0]?.name ?? "Unknown",
      }
    : undefined;

  return { error: null, operator };
}

export async function deleteOperator(
  id: string,
  accountId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: op } = await supabase
    .from("operators")
    .select("branch_id, auth_user_id, branches(account_id)")
    .eq("id", id)
    .single();

  if (!op) return { error: "Operator not found." };

  const branchAccountId = (op.branches as unknown as { account_id: string } | null)?.account_id;
  if (branchAccountId !== accountId) return { error: "Access denied." };

  await deleteAuthUser(op.auth_user_id);

  const { error } = await supabase.from("operators").delete().eq("id", id);
  if (error) return { error: error.message };
  return { error: null };
}

export async function resetOperatorPin(
  id: string,
  accountId: string,
  newPin: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: op } = await supabase
    .from("operators")
    .select("branch_id, branches(account_id)")
    .eq("id", id)
    .single();

  if (!op) return { error: "Operator not found." };

  const branchAccountId = (op.branches as unknown as { account_id: string } | null)?.account_id;
  if (branchAccountId !== accountId) return { error: "Access denied." };

  const pinError = await validatePin(newPin);
  if (pinError) return { error: pinError };

  const pinHash = await hashPin(newPin);

  const { error } = await supabase
    .from("operators")
    .update({ pin_hash: pinHash })
    .eq("id", id);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Resolves a web-login operator by their Supabase Auth user id (branch portal
 * session). Returns the operator with branch + owning account context.
 */
export async function getOperatorByAuthUser(
  authUserId: string
): Promise<{ operator: Operator | null; accountId: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data: op } = await supabase
    .from("operators")
    .select("id, name, role, branch_id, web_enabled, branches(id, name, account_id)")
    .eq("auth_user_id", authUserId)
    .eq("web_enabled", true)
    .maybeSingle();

  if (!op) {
    return { operator: null, accountId: null, error: "Operator not found." };
  }

  const branch = op.branches as unknown as { id: string; name: string; account_id: string }[] | null;
  const branchRow = branch?.[0] ?? null;

  return {
    operator: {
      id: op.id,
      name: op.name,
      pin_hash: "",
      role: op.role as "admin" | "operator",
      branch_id: op.branch_id,
      branch_name: branchRow?.name ?? "Branch",
      web_enabled: true,
    },
    accountId: branchRow?.account_id ?? null,
    error: null,
  };
}