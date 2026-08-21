/**
 * The durable INCOMING-transfer saga state machine.
 *
 * An incoming transfer is a separate, flag-gated, owner-only lifecycle. Its
 * safety contract mirrors purchase/renewal:
 *  - the transfer is SUBMITTED only after confirmed Stripe capture (no path to
 *    `transfer_submitting` except from `payment_captured`);
 *  - the submission happens exactly once; an ambiguous submission becomes
 *    `transfer_unknown` with NO auto-retry edge and NO direct refund edge —
 *    only read-only reconciliation resolves it;
 *  - refunds flow queued → pending → refunded|failed (never a jump to refunded);
 *  - transfers are slow and registry/registrar-gated: `transfer_pending` is a
 *    long poll with no guaranteed completion date.
 *
 * Outgoing transfers are NOT a saga — they are deliberate, separately-confirmed
 * owner actions (unlock + auth-code request) handled by the service directly.
 */

import type { PaymentState, RefundState } from "../saga/domainSagaState";

export type { PaymentState, RefundState };

export type TransferStatus =
  | "quote_ready"
  | "checkout_created"
  | "awaiting_payment"
  | "payment_captured"
  | "transfer_submitting"
  | "transfer_pending"
  | "transfer_completed"
  | "transfer_unknown"
  | "transfer_failed"
  | "refund_queued"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | "canceled"
  | "needs_attention";

/** Separate durable transfer fact — never folded into TransferStatus. */
export type TransferProviderState =
  | "none"
  | "submitting"
  | "pending"
  | "completed"
  | "failed"
  | "unknown";

export class IllegalTransferTransitionError extends Error {
  constructor(from: TransferStatus, to: TransferStatus) {
    super(`Illegal transfer transition ${from} -> ${to}.`);
    this.name = "IllegalTransferTransitionError";
  }
}

export const TRANSFER_TERMINAL: ReadonlySet<TransferStatus> = new Set([
  "transfer_completed",
  "refunded",
  "canceled",
]);

const TRANSITIONS: Record<TransferStatus, readonly TransferStatus[]> = {
  quote_ready: ["checkout_created", "canceled"],
  checkout_created: ["awaiting_payment", "canceled"],
  awaiting_payment: ["payment_captured", "canceled", "needs_attention"],
  // Submission is ONLY reachable after capture.
  payment_captured: ["transfer_submitting", "needs_attention"],
  // Some registrars/TLDs report completion immediately on submit.
  transfer_submitting: ["transfer_pending", "transfer_completed", "transfer_unknown", "transfer_failed", "needs_attention"],
  // A long poll: the registry/losing registrar controls timing.
  transfer_pending: ["transfer_completed", "transfer_failed", "transfer_unknown", "needs_attention"],
  // Ambiguous: no auto-retry submission, no direct refund. Reconciliation may
  // discover it completed, failed, or is (still) pending at the registry.
  transfer_unknown: ["transfer_completed", "transfer_pending", "refund_queued", "needs_attention"],
  transfer_completed: [], // terminal success
  transfer_failed: ["refund_queued", "needs_attention"],
  refund_queued: ["refund_pending", "needs_attention"],
  refund_pending: ["refunded", "refund_failed"],
  refunded: [], // terminal
  refund_failed: ["needs_attention", "refund_pending"],
  canceled: [], // terminal
  needs_attention: ["transfer_completed", "refund_queued", "refund_pending", "transfer_pending", "canceled"],
};

export function canTransferTransition(from: TransferStatus, to: TransferStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function transferTransition(from: TransferStatus, to: TransferStatus): TransferStatus {
  if (!canTransferTransition(from, to)) {
    throw new IllegalTransferTransitionError(from, to);
  }
  return to;
}

export function isTransferTerminal(status: TransferStatus): boolean {
  return TRANSFER_TERMINAL.has(status);
}
