/**
 * @file lib/subscription.ts
 * @description Server-only subscription engine shared by the subscription API
 * routes and the Payme webhook. True payment amounts flow through Payme Africa
 * (sandbox); here we only record intent, trigger the collection, and — once the
 * webhook confirms — activate/extend a real 30-day subscription window.
 *
 * Money model:
 *   - Pharmacies + suppliers subscribe on the web portal.
 *   - Payment: Payme collection (mobile-money USSD push) credited to Cervopharma Org.
 *   - Confirmation: Payme webhook against reference `SUB-…` → activateSubscription().
 *   - Activation extends from `now` (or the current expiry if it is still future).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FIVE_THOUSAND = 5000;

export interface SubscriptionPlan {
  id: string;
  name: string;
  audience: "pharmacy" | "supplier";
  price_monthly_tzs: number;
  price_annual_tzs: number;
  max_branches: number;
  max_operators: number;
  max_suppliers: number;
  max_connected_pharmacies: number;
  features: string[] | null;
}

/** A pay-as-you-go plan the account has no stored plan for (no subscription_payments row). */
export const PAYG_PLAN_ID = "payg";

/**
 * Persists the paying mobile-money wallet to the account's payment_settings
 * row (mirrors accounts.payme_wallet_number for the web/branch consoles).
 */
export async function savePaymentSettingsWallet(accountId: string, wallet: string): Promise<void> {
  const { createServiceClient } = await import("@/lib/supabase/server");
  const service = await createServiceClient();
  const w = wallet.trim();
  if (!w) return;

  const { data: existing } = await service
    .from("payment_settings")
    .select("id, payme_wallet_number")
    .eq("account_id", accountId)
    .maybeSingle();

  if (existing) {
    await service.from("payment_settings").update({ payme_wallet_number: w, updated_at: new Date().toISOString() }).eq("account_id", accountId);
  } else {
    await service.from("payment_settings").insert({
      account_id: accountId,
      payme_wallet_number: w,
      default_method: "mobile_money",
      accepted_methods: ["mobile_money"],
    });
  }

  // Reflect on accounts.payme_wallet_number too (settlement + checkout read it directly).
  await service.from("accounts").update({ payme_wallet_number: w }).eq("id", accountId);
}

export function isSubscribedActive(account: {
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
}): boolean {
  const status = account.subscription_status;
  if (status === "active" || status === "trial") return true;
  if (account.subscription_expires_at) {
    const expiry = new Date(account.subscription_expires_at).getTime();
    if (expiry > Date.now()) return true;
  }
  return false;
}

/**
 * Fetches subscription plans for an audience, optionally filtering to a single plan.
 */
export async function getPlans(
  service: SupabaseClient,
  audience: "pharmacy" | "supplier" = "pharmacy",
  planId?: string
): Promise<{ data: SubscriptionPlan[] | null; error: string | null }> {
  let query = service
    .from("subscription_plans")
    .select("id, name, audience, price_monthly_tzs, price_annual_tzs, max_branches, max_operators, max_suppliers, max_connected_pharmacies, features")
    .eq("audience", audience)
    .order("price_monthly_tzs", { ascending: true });

  if (planId) query = query.eq("id", planId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: data as SubscriptionPlan[] | null, error: null };
}

export interface SubscriptionCheckoutResult {
  reference: string | null;
  message: string | null;
  error: string | null;
}

/**
 * Records a subscription intent, inserts a `payments` row and a
 * `subscription_payments` row, then pushes a Payme mobile-money collection
 * to the payer. The actual activation happens via webhook.
 */
export async function createSubscriptionCheckout(args: {
  service: SupabaseClient;
  accountId: string;
  plan: SubscriptionPlan;
  months?: number;
  msisdn?: string;
  idempotencyKey?: string;
}): Promise<SubscriptionCheckoutResult> {
  const { service, accountId, plan, msisdn } = args;
  const months = Math.max(1, Math.floor(args.months ?? 1));
  const amountTzs = plan.price_monthly_tzs * months;

  const reference = `SUB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const wallet = (msisdn ?? "").trim();

  const { error: payInsertError } = await service.from("payments").insert({
    account_id: accountId,
    reference,
    amount_tzs: amountTzs,
    msisdn: wallet || null,
    status: "pending",
    provider: "payme",
  });
  if (payInsertError) return { reference: null, message: null, error: payInsertError.message };

  const { error: subInsertError } = await service.from("subscription_payments").insert({
    account_id: accountId,
    plan_id: plan.id,
    audience: plan.audience,
    amount_tzs: amountTzs,
    reference,
    months,
    status: "pending",
  });
  if (subInsertError) {
    await service.from("payments").update({ status: "failed", failure_reason: subInsertError.message }).eq("reference", reference);
    return { reference: null, message: null, error: subInsertError.message };
  }

  const { initiateCollection } = await import("@/lib/payme");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data: paymeData, error: paymeError } = await initiateCollection({
    amount: amountTzs,
    msisdn: wallet,
    reference,
    callback_url: `${appUrl}/api/webhooks/payme`,
  });

  if (paymeError) {
    await service.from("payments")
      .update({ status: "failed", failure_reason: paymeError })
      .eq("reference", reference);
    await service.from("subscription_payments")
      .update({ status: "failed", failure_reason: paymeError })
      .eq("reference", reference);
    return { reference, message: null, error: paymeError };
  }

  const completed = paymeData?.payment_status === "COMPLETED";
  await service.from("payments")
    .update({
      provider_transaction_id: paymeData?.transaction_id || null,
      status: completed ? "completed" : "pending",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("reference", reference);

  return {
    reference,
    message: completed
      ? "Payment confirmed — your subscription is active."
      : "Payment initiated — confirm the mobile money prompt to activate your subscription.",
    error: null,
  };
}

/**
 * Activates (or extends) an account subscription after Payme confirmation.
 *
 * The validation window defaults to `now` (fresh activation) but if the account
 * already has a subscription expiring in the future, the new window extends
 * from that expiry instead, so renewals stack.
 */
export async function activateSubscription(args: {
  service: SupabaseClient;
  reference: string;
}): Promise<{ ok: boolean; message: string }> {
  const { service, reference } = args;

  const { data: subPayment, error: fetchError } = await service
    .from("subscription_payments")
    .select("id, account_id, plan_id, audience, amount_tzs, reference, months, status, activated_at, expires_at, subscription_plans(id, name, max_branches, max_operators, max_suppliers, max_connected_pharmacies)")
    .eq("reference", reference)
    .single();

  if (fetchError || !subPayment) {
    return { ok: false, message: "Subscription payment not found." };
  }

  if (subPayment.status === "confirmed" && subPayment.expires_at && new Date(subPayment.expires_at).getTime() > Date.now()) {
    return { ok: true, message: "Already active." };
  }

  const plan = subPayment.subscription_plans as unknown as {
    id: string; name: string;
    max_branches: number; max_operators: number;
    max_suppliers: number; max_connected_pharmacies: number;
  } | null;

  const { data: account } = await service
    .from("accounts")
    .select("id, type, subscription_expires_at, subscription_started_at, trial_ends_at")
    .eq("id", subPayment.account_id)
    .single();

  const nowMs = Date.now();
  const existing = account?.subscription_expires_at
    ? new Date(account.subscription_expires_at).getTime()
    : 0;
  const baseMs = Math.max(nowMs, existing);
  const months = Math.max(1, subPayment.months ?? 1);
  const newExpires = new Date(baseMs + months * 30 * 24 * 60 * 60 * 1000);

  const { error: subUpdateError } = await service
    .from("subscription_payments")
    .update({
      status: "confirmed",
      activated_at: new Date().toISOString(),
      expires_at: newExpires.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", subPayment.id);

  if (subUpdateError) return { ok: false, message: subUpdateError.message };

  const { error: accountError } = await service
    .from("accounts")
    .update({
      subscription_status: "active",
      subscription_plan: plan?.id ?? null,
      subscription_started_at: account?.subscription_started_at ?? new Date().toISOString(),
      subscription_expires_at: newExpires.toISOString(),
      grace_ends_at: null,
      suspended_at: null,
    })
    .eq("id", subPayment.account_id);

  if (accountError) return { ok: false, message: accountError.message };

  // Pharmacy: ripple the paid-window to the account's branches so the desktop
  // app (which gates on branch status) sees the renewal.
  if (account?.type !== "supplier") {
    await service
      .from("branches")
      .update({
        subscription_status: "active",
        subscription_expires_at: newExpires.toISOString(),
        grace_ends_at: null,
      })
      .eq("account_id", subPayment.account_id);
  }

  return { ok: true, message: "Subscription activated." };
}