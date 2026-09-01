import { describe, it, expect, vi, beforeEach } from "vitest";

const HMAC_SECRET = "test-secret";

vi.stubEnv("PAYME_APP_ID", "test-app-id");
vi.stubEnv("PAYME_APP_SECRET", HMAC_SECRET);
vi.stubEnv("PAYME_ENVIRONMENT", "sandbox");

function computeExpectedSignature(payload: string, timestamp: string): string {
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", HMAC_SECRET);
  hmac.update(payload + timestamp);
  // Payme spec: Base64( HMAC_SHA256( Payload + X-Timestamp, Secret ) ) on raw digest bytes.
  return hmac.digest("base64");
}

describe("verifyWebhookSignature", () => {
  let verifyWebhookSignature: typeof import("@/lib/payme").verifyWebhookSignature;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/payme");
    verifyWebhookSignature = mod.verifyWebhookSignature;
  });

  it("returns true for a valid signature with a recent timestamp", () => {
    const payload = '{"transid":"123","result":"SUCCESS"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computeExpectedSignature(payload, timestamp);

    expect(verifyWebhookSignature(payload, timestamp, signature)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const payload = '{"transid":"123","result":"SUCCESS"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();

    expect(verifyWebhookSignature(payload, timestamp, "badsignature")).toBe(false);
  });

  it("returns false when the timestamp has expired (older than 5 minutes)", () => {
    const payload = '{"transid":"123","result":"SUCCESS"}';
    const sixMinAgo = Math.floor(Date.now() / 1000) - 360;
    const timestamp = sixMinAgo.toString();
    const signature = computeExpectedSignature(payload, timestamp);

    expect(verifyWebhookSignature(payload, timestamp, signature)).toBe(false);
  });

  it("returns false for a non-numeric timestamp", () => {
    const payload = '{"transid":"123","result":"SUCCESS"}';
    const signature = computeExpectedSignature(payload, "not-a-number");

    expect(verifyWebhookSignature(payload, "not-a-number", signature)).toBe(false);
  });
});

describe("initiateCollection", () => {
  it("returns error when PAYME_APP_ID is missing", async () => {
    vi.stubEnv("PAYME_APP_ID", "");
    vi.stubEnv("PAYME_APP_SECRET", HMAC_SECRET);
    vi.resetModules();

    const { initiateCollection } = await import("@/lib/payme");
    const result = await initiateCollection({
      amount: 1000,
      msisdn: "+255712345678",
      reference: "REF-001",
    });

    expect(result.error).toContain("credentials not configured");
    expect(result.data).toBeNull();
  });

  it("returns error when PAYME_APP_SECRET is missing", async () => {
    vi.stubEnv("PAYME_APP_ID", "test-app-id");
    vi.stubEnv("PAYME_APP_SECRET", "");
    vi.resetModules();

    const { initiateCollection } = await import("@/lib/payme");
    const result = await initiateCollection({
      amount: 1000,
      msisdn: "+255712345678",
      reference: "REF-001",
    });

    expect(result.error).toContain("credentials not configured");
    expect(result.data).toBeNull();
  });
});
