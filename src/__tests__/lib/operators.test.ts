import { describe, it, expect } from "vitest";
import { validatePin } from "@/lib/actions/operators";

describe("validatePin", () => {
  it("accepts a 4-digit PIN", async () => {
    expect(await validatePin("1234")).toBeNull();
  });

  it("accepts an 8-digit PIN", async () => {
    expect(await validatePin("12345678")).toBeNull();
  });

  it("accepts a 6-digit PIN", async () => {
    expect(await validatePin("123456")).toBeNull();
  });

  it("rejects a PIN with fewer than 4 digits", async () => {
    expect(await validatePin("123")).toBe("PIN must be 4-8 digits.");
    expect(await validatePin("1")).toBe("PIN must be 4-8 digits.");
    expect(await validatePin("")).toBe("PIN must be 4-8 digits.");
  });

  it("rejects a PIN with more than 8 digits", async () => {
    expect(await validatePin("123456789")).toBe("PIN must be 4-8 digits.");
    expect(await validatePin("1234567890")).toBe("PIN must be 4-8 digits.");
  });

  it("rejects non-numeric PINs", async () => {
    expect(await validatePin("abcd")).toBe("PIN must be 4-8 digits.");
    expect(await validatePin("12a4")).toBe("PIN must be 4-8 digits.");
    expect(await validatePin("12 34")).toBe("PIN must be 4-8 digits.");
    expect(await validatePin("12.34")).toBe("PIN must be 4-8 digits.");
  });
});
