/**
 * @file lib/actions/payments.ts
 * @description Server actions for per-account payment method configuration.
 *
 * Table: payment_settings (one row per account, unique on account_id)
 *   Pharmacy accounts store: accepted POS methods, mobile money numbers,
 *   bank details, card toggle, and Payme Africa marketplace wallet.
 *   Supplier accounts store: receiving mobile money numbers, bank for invoices,
 *   and Payme Africa marketplace wallet.
 *
 * ── Planned marketplace payment flow (not yet implemented) ──────────────────
 * When a pharmacy places a marketplace order, Cervos will use the Payme Africa
 * tripartite escrow API:
 *   1. Pharmacy pays into escrow (pharmacy.payme_wallet_number debited)
 *   2. On delivery confirmation, escrow disburses to supplier (supplier.payme_wallet_number credited)
 *   3. All escrow legs are recorded in a future `ledger_entries` table
 *      (columns: id, marketplace_order_id, direction, amount, currency, status, created_at)
 *   4. The future `marketplace_orders` table ties pharmacy → supplier orders together
 *      and stores the Payme Africa collection/disbursement reference IDs.
 * This config table is built now so credentials can be captured before the API integration.
 *
 * @environment NEXT_PUBLIC_SUPABASE_URL
 * @environment NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
"use server";

import { createClient } from "@/lib/supabase/server";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AcceptedMethod = "cash" | "mobile_money" | "card" | "bank_transfer" | "invoice";

export interface PaymentSettings {
  id?: string;
  account_id: string;
  /** Primary method shown at POS checkout / used for marketplace. */
  default_method: AcceptedMethod;
  /** Which methods this account accepts (POS) or offers (supplier). */
  accepted_methods: AcceptedMethod[];
  /** M-Pesa wallet number (10-digit, e.g. 0712345678 or +255712345678) */
  mpesa_number: string | null;
  /** Tigo Pesa wallet number */
  tigo_number: string | null;
  /** Halopesa wallet number */
  halopesa_number: string | null;
  /** Airtel Money wallet number */
  airtel_number: string | null;
  /** Bank name for bank-transfer payments */
  bank_name: string | null;
  /** Bank account number */
  bank_account: string | null;
  /** Bank branch name or code */
  bank_branch: string | null;
  /**
   * Payme Africa wallet phone number.
   * Pharmacy: debited when placing a marketplace order.
   * Supplier: credited when an order is delivered and escrow disburses.
   */
  payme_wallet_number: string | null;
  updated_at?: string;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_METHODS: AcceptedMethod[] = ["cash", "mobile_money", "card", "bank_transfer", "invoice"];

/**
 * Validates a Tanzanian mobile money phone number.
 * Accepts: 0XXXXXXXXX (10 digits) or +255XXXXXXXXX (12 digits after prefix)
 * Returns null if valid, error message if invalid.
 */
function validatePhone(value: string | null, label: string): string | null {
  if (!value || value.trim() === "") return null; // optional — empty is fine
  const cleaned = value.trim();
  const tz10  = /^0[67]\d{8}$/.test(cleaned);         // 0712345678
  const tz255 = /^\+255[67]\d{8}$/.test(cleaned);     // +255712345678
  if (!tz10 && !tz255) {
    return `${label}: enter a valid Tanzanian number (e.g. 0712 345 678 or +255712345678).`;
  }
  return null;
}

// ─── Server actions ───────────────────────────────────────────────────────────

/**
 * Fetches the payment_settings row for the currently signed-in account.
 * Returns null settings (not an error) when no row exists yet — this is
 * expected for new accounts before first save.
 *
 * @returns `{ settings, accountId, error }`
 */
export async function getPaymentSettings(): Promise<{
  settings: PaymentSettings | null;
  accountId: string | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { settings: null, accountId: null, error: "Not authenticated." };

  const { data: account, error: acctError } = await supabase
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (acctError || !account) return { settings: null, accountId: null, error: "Account not found." };

  const { data, error } = await supabase
    .from("payment_settings")
    .select("*")
    .eq("account_id", account.id)
    .maybeSingle();

  if (error) return { settings: null, accountId: account.id, error: error.message };

  return { settings: data as PaymentSettings | null, accountId: account.id, error: null };
}

/** Methods permitted for pharmacy POS (all five). */
const PHARMACY_METHODS: AcceptedMethod[] = ["cash", "mobile_money", "card", "bank_transfer", "invoice"];

/** Methods permitted for supplier receiving (no cash/card at counter). */
const SUPPLIER_METHODS: AcceptedMethod[] = ["mobile_money", "bank_transfer", "invoice"];

/**
 * Upserts (inserts or updates) the payment_settings row for the currently
 * signed-in account.
 *
 * Validates phone numbers and method values server-side before writing.
 * Permitted methods are enforced by account type:
 *   - pharmacy: any subset of {cash, mobile_money, card, bank_transfer, invoice}; cash always required.
 *   - supplier: only {mobile_money, bank_transfer, invoice}; cash and card are not permitted.
 * Uses `onConflict: "account_id"` so a second save updates the existing row.
 *
 * @param settings - Partial settings object; account_id is ignored (resolved from session).
 * @returns `{ error }` — null on success, message on failure
 */
export async function savePaymentSettings(
  settings: Omit<PaymentSettings, "id" | "account_id" | "updated_at">
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: account, error: acctError } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("auth_user_id", user.id)
    .single();

  if (acctError || !account) return { error: "Account not found." };

  const isPharmacy = account.type === "pharmacy";
  const isSupplier = account.type === "supplier";

  if (!isPharmacy && !isSupplier) {
    return { error: "Payment settings are only available for pharmacy and supplier accounts." };
  }

  // Permitted set for this account type
  const permittedMethods = isPharmacy ? PHARMACY_METHODS : SUPPLIER_METHODS;

  // Validate accepted_methods
  if (!Array.isArray(settings.accepted_methods) || settings.accepted_methods.length === 0) {
    return { error: "At least one payment method must be selected." };
  }
  for (const m of settings.accepted_methods) {
    if (!permittedMethods.includes(m)) {
      return { error: `Payment method "${m}" is not permitted for ${account.type} accounts.` };
    }
  }

  // Pharmacy: cash must always be present
  if (isPharmacy && !settings.accepted_methods.includes("cash")) {
    return { error: "Cash must always be enabled for pharmacy accounts." };
  }

  if (!permittedMethods.includes(settings.default_method)) {
    return { error: `Default method "${settings.default_method}" is not permitted for ${account.type} accounts.` };
  }
  if (!settings.accepted_methods.includes(settings.default_method)) {
    return { error: "Default method must be one of the accepted methods." };
  }

  // Validate phone numbers
  const phoneErrors = [
    validatePhone(settings.mpesa_number,       "M-Pesa number"),
    validatePhone(settings.tigo_number,        "Tigo Pesa number"),
    validatePhone(settings.halopesa_number,    "Halopesa number"),
    validatePhone(settings.airtel_number,      "Airtel Money number"),
    validatePhone(settings.payme_wallet_number,"Payme Africa wallet number"),
  ].filter(Boolean);

  if (phoneErrors.length > 0) return { error: phoneErrors[0]! };

  const row = {
    account_id:           account.id,
    default_method:       settings.default_method,
    accepted_methods:     settings.accepted_methods,
    mpesa_number:         settings.mpesa_number?.trim() || null,
    tigo_number:          settings.tigo_number?.trim() || null,
    halopesa_number:      settings.halopesa_number?.trim() || null,
    airtel_number:        settings.airtel_number?.trim() || null,
    bank_name:            settings.bank_name?.trim() || null,
    bank_account:         settings.bank_account?.trim() || null,
    bank_branch:          settings.bank_branch?.trim() || null,
    payme_wallet_number:  settings.payme_wallet_number?.trim() || null,
    updated_at:           new Date().toISOString(),
  };

  const { error } = await supabase
    .from("payment_settings")
    .upsert(row, { onConflict: "account_id" });

  if (error) return { error: error.message };
  return { error: null };
}

// ─── Payme Africa Collection (real payments) ────────────────────────────────

export interface CreatePaymentInput {
  order_id?: string;
  amount_tzs: number;
  msisdn: string;
  reference: string;
  idempotency_key: string;
}

export interface PaymentRecord {
  id: string;
  reference: string;
  status: string;
  provider_transaction_id: string | null;
  amount_tzs: number;
}

/**
 * Initiates a Payme Africa mobile money collection.
 * Creates a pending payment record, calls the Payme API, and stores the provider reference.
 */
export async function initiatePayment(
  input: CreatePaymentInput
): Promise<{ data: PaymentRecord | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated." };

  const { data: account, error: acctError } = await supabase
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (acctError || !account) return { data: null, error: "Account not found." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error: insertError } = await supabase.from("payments").insert({
    account_id: account.id,
    order_id: input.order_id || null,
    reference: input.reference,
    idempotency_key: input.idempotency_key,
    amount_tzs: input.amount_tzs,
    msisdn: input.msisdn,
    status: "pending",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { data: null, error: "A payment with this reference already exists." };
    }
    return { data: null, error: insertError.message };
  }

  const { initiateCollection } = await import("@/lib/payme");
  const { data: paymeResponse, error: paymeError } = await initiateCollection({
    amount: input.amount_tzs,
    msisdn: input.msisdn,
    reference: input.reference,
    callback_url: `${appUrl}/api/webhooks/payme`,
  });

  if (paymeError) {
    await supabase
      .from("payments")
      .update({ status: "failed", failure_reason: paymeError })
      .eq("reference", input.reference);
    return { data: null, error: paymeError };
  }

  await supabase
    .from("payments")
    .update({
      provider_transaction_id: paymeResponse?.transaction_id || null,
      status: paymeResponse?.payment_status === "COMPLETED" ? "completed" : "pending",
      completed_at: paymeResponse?.payment_status === "completed" ? new Date().toISOString() : null,
    })
    .eq("reference", input.reference);

  return {
    data: {
      id: "",
      reference: input.reference,
      status: paymeResponse?.payment_status || "pending",
      provider_transaction_id: paymeResponse?.transaction_id || null,
      amount_tzs: input.amount_tzs,
    },
    error: null,
  };
}

/**
 * Queries the current status of a payment by reference.
 * Useful for polling when a webhook hasn't arrived yet.
 */
export async function getPaymentStatus(
  reference: string
): Promise<{ data: { status: string; payment_status: string } | null; error: string | null }> {
  const { queryTransaction } = await import("@/lib/payme");
  return queryTransaction(reference);
}

/**
 * Gets payment history for the current account.
 */
export async function getPaymentHistory(): Promise<{
  data: PaymentRecord[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!account) return { data: null, error: "Account not found." };

  const { data, error } = await supabase
    .from("payments")
    .select("id, reference, status, provider_transaction_id, amount_tzs, created_at, completed_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: error.message };
  return { data: data as PaymentRecord[], error: null };
}
