"use server";

import { createClient } from "@/lib/supabase/server";

export interface Operator {
  id: string;
  name: string;
  pin_hash: string;
  role: "admin" | "operator";
  branch_id: string;
  branch_name?: string;
  created_at?: string;
}

export interface CreateOperatorInput {
  name: string;
  pin: string;
  role: "admin" | "operator";
  branch_id: string;
}

export interface UpdateOperatorInput {
  name?: string;
  role?: "admin" | "operator";
  branch_id?: string;
}

export async function validatePin(pin: string): Promise<string | null> {
  if (!/^\d{4,8}$/.test(pin)) return "PIN must be 4-8 digits.";
  return null;
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOperators(accountId: string): Promise<Operator[]> {
  const supabase = await createClient();

  const { data: branches } = await supabase
    .from("branches")
    .select("id")
    .eq("account_id", accountId);

  const branchIds = (branches ?? []).map((b) => b.id);

  if (branchIds.length === 0) return [];

  const { data } = await supabase
    .from("operators")
    .select("id, name, pin_hash, role, branch_id, created_at, branches(name)")
    .in("branch_id", branchIds)
    .order("name");

  return ((data ?? []) as unknown as (Operator & { branches: { name: string }[] | null })[]).map((row) => ({
    ...row,
    branch_name: row.branches?.[0]?.name ?? "Unknown",
  }));
}

export async function createOperator(
  accountId: string,
  input: CreateOperatorInput
): Promise<{ error: string | null }> {
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

  const pinHash = await hashPin(input.pin);

  const { error } = await supabase.from("operators").insert({
    name: input.name,
    pin_hash: pinHash,
    role: input.role,
    branch_id: input.branch_id,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateOperator(
  id: string,
  accountId: string,
  input: UpdateOperatorInput
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

  const { error } = await supabase
    .from("operators")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteOperator(
  id: string,
  accountId: string
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
