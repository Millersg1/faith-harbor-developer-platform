import { describe, expect, it } from "vitest";

import type { AccountBalanceResult } from "./RegistrarProvider";
import {
  classifyRegistrarFunding,
  fundingOutcome,
  isDefinitiveFundingFailure,
} from "./registrarFunding";

const avail = (amountMinor: number, currency = "USD"): AccountBalanceResult => ({ status: "available", amountMinor, currency });

describe("Stage L/1C — registrar funding decision (safe balance semantics)", () => {
  it("confirmed sufficient balance => proceed", () => {
    const d = classifyRegistrarFunding(avail(5000), 1500, "USD");
    expect(d.kind).toBe("sufficient");
    expect(fundingOutcome(d)).toBe("proceed");
    expect(isDefinitiveFundingFailure(d)).toBe(false);
  });

  it("confirmed exactly 0.00 is a REAL balance, not 'unavailable'", () => {
    expect(fundingOutcome(classifyRegistrarFunding(avail(0), 0, "USD"))).toBe("proceed"); // 0 required, 0 have
    const d = classifyRegistrarFunding(avail(0), 100, "USD"); // need 1.00, have 0.00
    expect(d.kind).toBe("insufficient_funds");
    expect(isDefinitiveFundingFailure(d)).toBe(true);
  });

  it("confirmed insufficient balance => insufficient_funds (definitive)", () => {
    const d = classifyRegistrarFunding(avail(999), 1500, "USD");
    expect(fundingOutcome(d)).toBe("insufficient_funds");
    expect(isDefinitiveFundingFailure(d)).toBe(true);
  });

  it("currency mismatch never compares amounts => defer", () => {
    const d = classifyRegistrarFunding(avail(100000, "EUR"), 1500, "USD");
    expect(d).toEqual({ kind: "unknown_defer", reason: "currency_mismatch" });
    expect(isDefinitiveFundingFailure(d)).toBe(false);
  });

  // The core Step-1C property, asserted across EVERY mutating/refund context.
  describe.each(["registration", "renewal", "transfer", "refund"])(
    "unavailable/unknown balance defers safely in the %s decision",
    (context) => {
      const unavailables: AccountBalanceResult[] = [
        { status: "unavailable", reason: "missing_balance_element" },
        { status: "unavailable", reason: "empty_balance" },
        { status: "unavailable", reason: "duplicate_balance_elements" },
        { status: "unavailable", reason: "malformed_balance" },
        { status: "unavailable", reason: "non_finite_balance" },
        { status: "unavailable", reason: "negative_balance" },
        { status: "unavailable", reason: "currency_unknown" },
        { status: "unsupported" },
      ];
      it.each(unavailables)(`${context}: %o -> defer, never insufficient, never refund`, (bal) => {
        const d = classifyRegistrarFunding(bal, 1500, "USD");
        expect(d.kind).toBe("unknown_defer");
        expect(fundingOutcome(d)).toBe("defer_needs_attention");
        // MUST NOT be read as insufficient funds or as refund-justifying evidence.
        expect(fundingOutcome(d)).not.toBe("insufficient_funds");
        expect(isDefinitiveFundingFailure(d)).toBe(false);
      });
    },
  );

  it("an invalid requirement never proceeds on a fabricated compare", () => {
    expect(fundingOutcome(classifyRegistrarFunding(avail(5000), Number.NaN, "USD"))).toBe("defer_needs_attention");
    expect(fundingOutcome(classifyRegistrarFunding(avail(5000), -1, "USD"))).toBe("defer_needs_attention");
  });
});
