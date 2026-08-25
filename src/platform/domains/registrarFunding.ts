/**
 * Provider-neutral registrar-FUNDING decision (Stage 12A Step 1C).
 *
 * Maps an account-balance read to a coarse, SAFE outcome for any registrar-funded
 * mutation — registration, renewal, transfer, and the refund decision that
 * follows a failure. The owner-set safety rules:
 *
 *  - a CONFIRMED available balance below the requirement => `insufficient_funds`;
 *  - an UNAVAILABLE / unsupported / currency-unknown balance => `unknown_defer`
 *    (the caller defers or raises needs_attention) — NEVER `insufficient_funds`
 *    and NEVER a refund justification;
 *  - a currency that does not match the requirement => `unknown_defer` (we never
 *    compare across currencies);
 *  - absent data can NEVER reach `sufficient` — no mutation proceeds on a
 *    fabricated zero.
 *
 * The mapping is deliberately IDENTICAL in every operational context: the funding
 * safety rule does not vary by whether we are registering, renewing, transferring,
 * or deciding a refund.
 */

import type { AccountBalanceResult } from "./RegistrarProvider";

export type FundingDecision =
  | { kind: "sufficient" }
  | { kind: "insufficient_funds" }
  | { kind: "unknown_defer"; reason: string };

/** Coarse operational outcome a caller acts on. */
export type FundingOutcome = "proceed" | "insufficient_funds" | "defer_needs_attention";

export function classifyRegistrarFunding(
  balance: AccountBalanceResult,
  requiredMinor: number,
  requiredCurrency: string,
): FundingDecision {
  if (balance.status === "unsupported") return { kind: "unknown_defer", reason: "balance_unsupported" };
  if (balance.status === "unavailable") return { kind: "unknown_defer", reason: balance.reason };
  // balance.status === "available"
  if (!requiredCurrency || balance.currency !== requiredCurrency) {
    return { kind: "unknown_defer", reason: "currency_mismatch" };
  }
  if (!Number.isFinite(requiredMinor) || requiredMinor < 0) {
    return { kind: "unknown_defer", reason: "invalid_requirement" };
  }
  return balance.amountMinor >= requiredMinor
    ? { kind: "sufficient" }
    : { kind: "insufficient_funds" };
}

/** The coarse operational outcome — the same safe mapping in every context. */
export function fundingOutcome(d: FundingDecision): FundingOutcome {
  switch (d.kind) {
    case "sufficient":
      return "proceed";
    case "insufficient_funds":
      return "insufficient_funds";
    case "unknown_defer":
      return "defer_needs_attention";
  }
}

/**
 * Whether a funding decision is DEFINITIVE evidence that could justify a
 * failure/refund path. TRUE only for a confirmed insufficient balance — an
 * unavailable/unknown balance is NEVER definitive and must not trigger a refund.
 */
export function isDefinitiveFundingFailure(d: FundingDecision): boolean {
  return d.kind === "insufficient_funds";
}
