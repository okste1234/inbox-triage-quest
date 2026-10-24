import { describe, expect, it } from "vitest";
import { findSensitive, redactSensitive } from "../src/sensitive.js";

describe("findSensitive", () => {
  it("finds US SSNs", () => {
    expect(findSensitive("my SSN is 123-45-6789")).toEqual(["ssn"]);
  });
  it("finds card numbers that pass the Luhn check, with spaces or dashes", () => {
    expect(findSensitive("card 4111 1111 1111 1111")).toEqual(["card"]);
    expect(findSensitive("card 4111-1111-1111-1111")).toEqual(["card"]);
    expect(findSensitive("4111111111111111")).toEqual(["card"]);
  });
  it("ignores long numbers that are not cards", () => {
    expect(findSensitive("order reference 1234 5678 9012 3456")).toEqual([]);
    expect(findSensitive("call me on +234 801 234 5678")).toEqual([]);
  });
  it("returns nothing for ordinary text", () => {
    expect(findSensitive("I applied on 12-03-2026 and have 3 years of experience")).toEqual([]);
  });
});

describe("redactSensitive", () => {
  it("replaces the numbers and keeps the rest", () => {
    const out = redactSensitive("My SSN is 123-45-6789 and card 4111 1111 1111 1111, thanks");
    expect(out).not.toMatch(/123-45-6789|4111/);
    expect(out).toContain("[REDACTED SSN]");
    expect(out).toContain("[REDACTED CARD]");
    expect(out).toContain("thanks");
  });
  it("leaves clean text untouched", () => {
    expect(redactSensitive("Any update?")).toBe("Any update?");
  });
});
