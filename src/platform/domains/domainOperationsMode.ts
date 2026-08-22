/**
 * The ONE authoritative switch for the domain-registration background workers
 * (registration fulfilment, renewal, transfer, refund, reconciliation). A single
 * value — never independent booleans — so a partial/typo'd config can never
 * half-enable provider mutation.
 *
 *  - `disabled` — no domain workers run at all. The emergency-rollback / default
 *    state. Nothing is claimed, submitted, charged, or refunded.
 *  - `reconcile_only` — ONLY the read-only reconciliation passes run: expired
 *    mutation leases are recovered to the appropriate `*_unknown` state and the
 *    provider is polled read-only to resolve unknowns. NO new provider mutation
 *    (no registration/renewal/transfer submission) and NO Stripe refund is
 *    issued in this mode — it is the safe "observe + converge" tier.
 *  - `full` — all passes run: fulfilment/submission, refund, and reconciliation.
 *
 * Resolution ALWAYS fails closed: MISSING / EMPTY / UNRECOGNIZED → `disabled`.
 * Enabling anything requires an EXPLICIT, recognized mode, so a fresh deploy, a
 * restored server, or a test environment can never silently start mutating.
 */
export type DomainOperationsMode = "disabled" | "reconcile_only" | "full";

export const DOMAIN_OPERATIONS_MODES: readonly DomainOperationsMode[] = [
  "disabled",
  "reconcile_only",
  "full",
];

export interface ResolvedDomainOperationsMode {
  mode: DomainOperationsMode;
  source: "unset_failed_closed" | "configured" | "invalid_failed_closed";
  raw?: string;
}

export function resolveDomainOperationsMode(
  raw: string | undefined,
): ResolvedDomainOperationsMode {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === "") {
    return { mode: "disabled", source: "unset_failed_closed" };
  }
  if ((DOMAIN_OPERATIONS_MODES as readonly string[]).includes(value)) {
    return { mode: value as DomainOperationsMode, source: "configured", raw: value };
  }
  return { mode: "disabled", source: "invalid_failed_closed", raw: value };
}

/** Whether provider MUTATION (submission/refund) may run in this mode. */
export function mutationAllowed(mode: DomainOperationsMode): boolean {
  return mode === "full";
}

/** Human-readable, secret-free one-liner for the startup banner. */
export function describeDomainOperationsMode(r: ResolvedDomainOperationsMode): string {
  const base = `domain operations mode = ${r.mode}`;
  if (r.source === "unset_failed_closed") {
    return `${base} (FAILED CLOSED: DOMAIN_OPERATIONS_MODE is unset — domain workers disabled until a mode is set explicitly)`;
  }
  if (r.source === "invalid_failed_closed") {
    return `${base} (FAILED CLOSED: DOMAIN_OPERATIONS_MODE="${r.raw}" is not one of disabled|reconcile_only|full)`;
  }
  return base;
}
