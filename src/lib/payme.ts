/**
 * @file lib/payme.ts
 * @description Payme Africa API client for collections, disbursements, and transaction queries.
 *
 * Authentication: HMAC-SHA256 signature per request.
 * All amounts are in TZS as integers.
 */

const BASE_URL = process.env.PAYME_API_URL || "https://portal.paymeafrica.com/api/v1";
const APP_ID = process.env.PAYME_APP_ID || "";
const APP_SECRET = process.env.PAYME_APP_SECRET || "";
const SANDBOX = process.env.PAYME_ENVIRONMENT === "sandbox" ? "1" : "0";

export interface PaymeCollectionRequest {
  amount: number;
  msisdn: string;
  reference: string;
  callback_url?: string;
}

export interface PaymeCollectionResponse {
  status: string;
  transaction_id: string;
  payment_status: string;
  provider_response: {
    result: string;
    resultcode: string;
    message: string;
  };
}

export interface PaymeDisbursementRequest {
  amount: number;
  msisdn: string;
  channel: string;
  reference: string;
}

export interface PaymeDisbursementResponse {
  status: string;
  transaction_id: string;
  payment_status: string;
  financials?: {
    system_profit: number;
    provider_fee: number;
    total_deductible: number;
  };
}

export interface PaymeQueryResponse {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  payment_status: string;
  created_at: string;
  provider_checked: boolean;
  provider_message: string | null;
}

export interface PaymeWebhookPayload {
  transid: string;
  reference: string;
  result: "SUCCESS" | "FAILED";
  payment_status: "PENDING" | "COMPLETED" | "FAILED";
  amount: string;
  msisdn: string;
}

function computeSignature(body: string, timestamp: string): string {
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", APP_SECRET);
  hmac.update(body + timestamp);
  return Buffer.from(hmac.digest("hex")).toString("base64");
}

function getHeaders(body: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeSignature(body, timestamp);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-ID": APP_ID,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };

  if (SANDBOX === "1") {
    headers["X-Sandbox"] = "1";
  }

  return headers;
}

async function paymeFetch<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  if (!APP_ID || !APP_SECRET) {
    return { data: null, error: "Payme Africa credentials not configured. Set PAYME_APP_ID and PAYME_APP_SECRET." };
  }

  const bodyStr = JSON.stringify(body);
  const headers = getHeaders(bodyStr);

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: bodyStr,
    });

    const json = await res.json();

    if (!res.ok) {
      return { data: null, error: json.error || json.message || `Payme API error: ${res.status}` };
    }

    return { data: json as T, error: null };
  } catch (err) {
    return { data: null, error: `Payme API request failed: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

/**
 * Initiates a mobile money collection (USSD push to customer).
 * Returns a PENDING status; the actual result comes via webhook.
 */
export async function initiateCollection(
  req: PaymeCollectionRequest
): Promise<{ data: PaymeCollectionResponse | null; error: string | null }> {
  return paymeFetch<PaymeCollectionResponse>("/transact", {
    action: "collection",
    amount: req.amount,
    msisdn: req.msisdn,
    reference: req.reference,
    ...(req.callback_url ? { callback_url: req.callback_url } : {}),
  });
}

/**
 * Initiates a disbursement (payout) to a mobile wallet or bank.
 */
export async function initiateDisbursement(
  req: PaymeDisbursementRequest
): Promise<{ data: PaymeDisbursementResponse | null; error: string | null }> {
  return paymeFetch<PaymeDisbursementResponse>("/transact", {
    action: "disbursement",
    amount: req.amount,
    msisdn: req.msisdn,
    channel: req.channel,
    reference: req.reference,
  });
}

/**
 * Queries the status of a transaction by reference.
 */
export async function queryTransaction(
  reference: string
): Promise<{ data: PaymeQueryResponse | null; error: string | null }> {
  return paymeFetch<PaymeQueryResponse>("/query", {
    reference,
  });
}

/**
 * Verifies a webhook signature from Payme Africa.
 * Use this in the webhook endpoint to confirm authenticity.
 */
export function verifyWebhookSignature(
  payload: string,
  timestamp: string,
  signature: string
): boolean {
  const crypto = require("crypto");
  const expected = Buffer.from(
    crypto.createHmac("sha256", APP_SECRET).update(payload + timestamp).digest("hex")
  ).toString("base64");

  if (signature !== expected) return false;

  const fiveMinAgo = Math.floor(Date.now() / 1000) - 300;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || ts < fiveMinAgo) return false;

  return true;
}
