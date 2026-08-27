import { describe, it, expect } from "vitest";
import { validatePin } from "@/lib/actions/operators";

describe("validatePin", () => {
  it("accepts a 4-digit PIN", () => {
    expect(validatePin("1234")).toBeNull();
  });

  it("accepts an 8-digit PIN", () => {
    expect(validatePin("12345678")).toBeNull();
  });

  it("accepts a 6-digit PIN", () => {
    expect(validatePin("123456")).toBeNull();
  });

  it("rejects a PIN with fewer than 4 digits", () => {
    expect(validatePin("123")).toBe("PIN must be 4-8 digits.");
    expect(validatePin("1")).toBe("PIN must be 4-8 digits.");
    expect(validatePin("")).toBe("PIN must be 4-8 digits.");
  });

  it("rejects a PIN with more than 8 digits", () => {
    expect(validatePin("123456789")).toBe("PIN must be 4-8 digits.");
    expect(validatePin("1234567890")).toBe("PIN must be 4-8 digits.");
  });

  it("rejects non-numeric PINs", () => {
    expect(validatePin("abcd")).toBe("PIN must be 4-8 digits.");
    expect(validatePin("12a4")).toBe("PIN must be 4-8 digits.");
    expect(validatePin("12 34")).toBe("PIN must be 4-8 digits.");
    expect(validatePin("12.34")).toBe("PIN must be 4-8 digits.");
  });
});
