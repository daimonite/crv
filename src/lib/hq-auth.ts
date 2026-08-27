/**
 * @file lib/hq-auth.ts
 * @description HQ Console session-token helpers — shared between middleware (proxy.ts)
 * and the HQ server actions (lib/actions/hq.ts).
 *
 * The HQ Console uses a separate authentication system from Supabase.
 * Instead of user accounts, operators authenticate with a single shared secret
 * (`HQ_SECRET` env var). The raw secret is never stored anywhere — only a
 * deterministic HMAC-SHA256 digest of it is stored in the `hq_sess` HttpOnly cookie.
 *
 * Flow:
 *  1. Operator enters the HQ secret on /hq login form
 *  2. `setHQCookie` server action calls `deriveHQSessionToken(secret)` and stores
 *     the resulting hex digest as an HttpOnly cookie for 8 hours
 *  3. On every subsequent /hq/* request, middleware calls `isValidHQToken()` to
 *     verify the cookie's hex digest against the freshly derived expected value
 *  4. If invalid or expired, middleware redirects to /hq login gate
 *
 * Security notes:
 *  - `isValidHQToken` uses `timingSafeEqual` to prevent timing-based attacks
 *  - Placeholder secrets and secrets < 32 chars are rejected
 *  - The raw `HQ_SECRET` never appears in logs, cookies, or client responses
 *
 * @environment HQ_SECRET — must be ≥ 32 chars and not the placeholder value
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Name of the HQ session cookie stored in the browser. */
export const HQ_COOKIE_NAME = "hq_sess";

/** Guard against the default placeholder in .env.local. */
const PLACEHOLDER = "placeholder-hq-secret";

/**
 * Returns the raw `HQ_SECRET` environment variable value.
 * Used by server actions to check whether the HQ console is configured.
 */
export function getHQSecret(): string | undefined {
  return process.env.HQ_SECRET;
}

/**
 * Derives the expected HQ session token from the configured secret.
 * Uses HMAC-SHA256 with a fixed message so the output is deterministic
 * but cannot be reversed to recover the raw secret.
 *
 * @param secret - The raw `HQ_SECRET` env var value
 * @returns Hex-encoded HMAC digest used as the session token
 */
export function deriveHQSessionToken(secret: string): string {
  return createHmac("sha256", secret).update("hq:session:v1").digest("hex");
}

/**
 * Validates a token value from the `hq_sess` cookie against the current
 * `HQ_SECRET` environment variable.
 *
 * Returns false (never throws) if:
 *  - `HQ_SECRET` is unset, the placeholder, or shorter than 32 chars
 *  - `token` is undefined or empty
 *  - The token does not match the expected HMAC digest (constant-time compare)
 *
 * @param token - The raw cookie value from `request.cookies.get(HQ_COOKIE_NAME)?.value`
 * @returns true if the token is a valid current HQ session
 */
export function isValidHQToken(token: string | undefined): boolean {
  const secret = process.env.HQ_SECRET;
  if (!secret || secret === PLACEHOLDER || secret.length < 32) return false;
  if (!token) return false;
  const expected = deriveHQSessionToken(secret);
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
