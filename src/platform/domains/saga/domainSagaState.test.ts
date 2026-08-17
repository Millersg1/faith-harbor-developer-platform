import { describe, expect, it } from "vitest";

import {
  canTransition,
  IllegalTransitionError,
  isTerminal,
  transition,
  type SagaStatus,
} from "./domainSagaState";

describe("domain saga state machine", () => {
  it("follows the authoritative happy path", () => {
    const path: SagaStatus[] = [
      "quote_ready",
      "checkout_created",
      "awaiting_payment",
      "payment_captured",
      "fulfillment_queued",
      "registering",
      "registered",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => transition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it("can NEVER reach registering without payment capture", () => {
    // No state other than fulfillment_queued transitions to registering...
    for (const from of [
      "quote_ready",
      "checkout_created",
      "awaiting_payment",
    ] as SagaStatus[]) {
      expect(canTransition(from, "registering")).toBe(false);
    }
    // ...and fulfillment_queued is only reachable from payment_captured.
    expect(canTransition("payment_captured", "fulfillment_queued")).toBe(true);
    expect(canTransition("awaiting_payment", "fulfillment_queued")).toBe(false);
  });

  it("ambiguous outcome has NO auto-retry and NO direct refund edge", () => {
    expect(canTransition("registration_unknown", "registering")).toBe(false);
    expect(canTransition("registration_unknown", "refunded")).toBe(false);
    // Only reconciliation outcomes are legal.
    expect(canTransition("registration_unknown", "registered")).toBe(true);
    expect(canTransition("registration_unknown", "refund_queued")).toBe(true);
    expect(canTransition("registration_unknown", "needs_attention")).toBe(true);
  });

  it("refunds never jump straight to refunded", () => {
    expect(canTransition("refund_queued", "refunded")).toBe(false);
    expect(canTransition("refund_queued", "refund_pending")).toBe(true);
    expect(canTransition("refund_pending", "refunded")).toBe(true);
    expect(canTransition("refund_pending", "refund_failed")).toBe(true);
  });

  it("definitive failures route to a refund", () => {
    expect(canTransition("provider_rejected", "refund_queued")).toBe(true);
    expect(canTransition("registration_failed", "refund_queued")).toBe(true);
  });

  it("terminal states have no exits", () => {
    for (const s of ["registered", "refunded", "canceled"] as SagaStatus[]) {
      expect(isTerminal(s)).toBe(true);
      expect(() => transition(s, "needs_attention")).toThrow(IllegalTransitionError);
    }
  });

  it("illegal transitions fail closed", () => {
    expect(() => transition("registered", "refund_queued")).toThrow(IllegalTransitionError);
    expect(() => transition("quote_ready", "registered")).toThrow(IllegalTransitionError);
    expect(() => transition("payment_captured", "registered")).toThrow(IllegalTransitionError);
  });
});
