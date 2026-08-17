/**
 * The durable domain-purchase saga state machine.
 *
 * The overall `SagaStatus` coordinates the flow, but the underlying FACTS —
 * payment, registrar, and refund — are tracked in SEPARATE state fields so no
 * single status ever conflates "paid", "registered", and "refunded". Illegal
 * transitions FAIL CLOSED ({@link IllegalTransitionError}); the transition
 * function is pure so the saga service + worker + reconciliation can all rely on
 * one authority.
 *
 * Hard rules encoded here:
 *  - registration can only follow payment capture (no path to `registering`
 *    except from `fulfillment_queued`, which only follows `payment_captured`);
 *  - an ambiguous outcome goes to `registration_unknown` and has NO edge that
 *    auto-retries registration and NO direct edge to a refund (refund only after
 *    reconciliation proves non-registration);
 *  - refunds flow through queued → pending → refunded|failed (never a jump
 *    straight to `refunded`).
 */

export type SagaStatus =
  | "quote_ready"
  | "checkout_created"
  | "awaiting_payment"
  | "payment_captured"
  | "fulfillment_queued"
  | "registering"
  | "registration_unknown"
  | "registered"
  | "provider_rejected"
  | "registration_failed"
  | "refund_queued"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | "canceled"
  | "needs_attention";

/** Separate durable payment fact — never folded into SagaStatus. */
export type PaymentState = "none" | "checkout_created" | "captured" | "failed";
/** Separate durable registrar fact. */
export type RegistrarState =
  | "none"
  | "queued"
  | "registering"
  | "registered"
  | "rejected"
  | "failed"
  | "unknown";
/** Separate durable refund fact. */
export type RefundState = "none" | "queued" | "pending" | "refunded" | "failed";

export class IllegalTransitionError extends Error {
  constructor(from: SagaStatus, to: SagaStatus) {
    super(`Illegal saga transition ${from} -> ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

/** Terminal states — no outgoing transitions. */
export const TERMINAL: ReadonlySet<SagaStatus> = new Set([
  "registered",
  "refunded",
  "canceled",
]);

const TRANSITIONS: Record<SagaStatus, readonly SagaStatus[]> = {
  quote_ready: ["checkout_created", "canceled"],
  checkout_created: ["awaiting_payment", "canceled"],
  awaiting_payment: ["payment_captured", "canceled", "needs_attention"],
  // Registration is ONLY reachable after capture.
  payment_captured: ["fulfillment_queued", "needs_attention"],
  fulfillment_queued: ["registering", "needs_attention"],
  registering: [
    "registered",
    "registration_unknown",
    "provider_rejected",
    "registration_failed",
    "needs_attention",
  ],
  // Ambiguous: no auto-retry edge, no direct refund edge. Only reconciliation.
  registration_unknown: [
    "registered", // reconciliation proved ownership
    "refund_queued", // reconciliation proved non-registration
    "needs_attention", // still uncertain -> owner review
  ],
  registered: [], // terminal success
  provider_rejected: ["refund_queued", "needs_attention"],
  registration_failed: ["refund_queued", "needs_attention"],
  refund_queued: ["refund_pending", "needs_attention"],
  refund_pending: ["refunded", "refund_failed"],
  refunded: [], // terminal
  refund_failed: ["needs_attention", "refund_pending"], // retry allowed via pending
  canceled: [], // terminal
  needs_attention: [
    // Owner-driven resolutions (evidence-gated in the service layer).
    "registered",
    "refund_queued",
    "refund_pending",
    "registering",
    "canceled",
  ],
};

export function canTransition(from: SagaStatus, to: SagaStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Returns `to` if the transition is legal; otherwise throws (fail closed). */
export function transition(from: SagaStatus, to: SagaStatus): SagaStatus {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

export function isTerminal(status: SagaStatus): boolean {
  return TERMINAL.has(status);
}
