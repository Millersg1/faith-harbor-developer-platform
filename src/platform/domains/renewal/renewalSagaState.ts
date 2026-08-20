/**
 * The durable domain-RENEWAL saga state machine.
 *
 * Renewal billing is a SEPARATE lifecycle from purchase (a cancelled workspace
 * never surrenders a paid domain; renewal is charged on its own). The overall
 * `RenewalStatus` coordinates the flow, but payment / registrar-renewal / refund
 * FACTS live in separate fields so no status ever conflates "paid", "renewed",
 * and "refunded".
 *
 * Hard rules encoded here (mirroring the purchase saga's safety contract):
 *  - a provider renewal can only follow payment capture (no path to `renewing`
 *    except from `renewal_queued`, which only follows `payment_captured`);
 *  - an ambiguous renewal goes to `renewal_unknown` with NO auto-retry edge and
 *    NO direct refund edge — refund only after read-only reconciliation proves
 *    the renewal did NOT occur;
 *  - refunds flow queued → pending → refunded|failed (never a jump to refunded);
 *  - two funding paths converge on `payment_captured`: a customer `checkout` or
 *    an authorized `off_session` charge.
 */

import type { PaymentState, RefundState } from "../saga/domainSagaState";

export type { PaymentState, RefundState };

export type RenewalStatus =
  | "quote_ready"
  | "checkout_created"
  | "off_session_authorized"
  | "awaiting_payment"
  | "payment_captured"
  | "renewal_queued"
  | "renewing"
  | "renewed"
  | "renewal_unknown"
  | "provider_rejected"
  | "renewal_failed"
  | "refund_queued"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | "canceled"
  | "needs_attention";

/** Separate durable registrar-renewal fact — never folded into RenewalStatus. */
export type RenewalState =
  | "none"
  | "queued"
  | "renewing"
  | "renewed"
  | "rejected"
  | "failed"
  | "unknown";

/** How the renewal is funded. */
export type ChargePath = "checkout" | "off_session";
/** Manual (customer-initiated) vs automatic (auto-renew) renewal. */
export type RenewalMode = "manual" | "auto";

export class IllegalRenewalTransitionError extends Error {
  constructor(from: RenewalStatus, to: RenewalStatus) {
    super(`Illegal renewal transition ${from} -> ${to}.`);
    this.name = "IllegalRenewalTransitionError";
  }
}

export const RENEWAL_TERMINAL: ReadonlySet<RenewalStatus> = new Set([
  "renewed",
  "refunded",
  "canceled",
]);

const TRANSITIONS: Record<RenewalStatus, readonly RenewalStatus[]> = {
  quote_ready: ["checkout_created", "off_session_authorized", "canceled"],
  checkout_created: ["awaiting_payment", "canceled"],
  // Off-session charge: succeed -> captured; requires_action/fail -> review/cancel.
  off_session_authorized: ["payment_captured", "needs_attention", "canceled"],
  awaiting_payment: ["payment_captured", "canceled", "needs_attention"],
  // Renewal is ONLY reachable after capture.
  payment_captured: ["renewal_queued", "needs_attention"],
  renewal_queued: ["renewing", "needs_attention"],
  renewing: [
    "renewed",
    "renewal_unknown",
    "provider_rejected",
    "renewal_failed",
    "renewal_queued", // bounded retry ONLY for pre-acceptance transport failures
    "needs_attention",
  ],
  // Ambiguous: no auto-retry edge, no direct refund edge. Only reconciliation.
  renewal_unknown: ["renewed", "refund_queued", "needs_attention"],
  renewed: [], // terminal success
  provider_rejected: ["refund_queued", "needs_attention"],
  renewal_failed: ["refund_queued", "needs_attention"],
  refund_queued: ["refund_pending", "needs_attention"],
  refund_pending: ["refunded", "refund_failed"],
  refunded: [], // terminal
  refund_failed: ["needs_attention", "refund_pending"],
  canceled: [], // terminal
  needs_attention: [
    "renewed",
    "refund_queued",
    "refund_pending",
    "renewing",
    "canceled",
  ],
};

export function canRenewalTransition(from: RenewalStatus, to: RenewalStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function renewalTransition(from: RenewalStatus, to: RenewalStatus): RenewalStatus {
  if (!canRenewalTransition(from, to)) {
    throw new IllegalRenewalTransitionError(from, to);
  }
  return to;
}

export function isRenewalTerminal(status: RenewalStatus): boolean {
  return RENEWAL_TERMINAL.has(status);
}
