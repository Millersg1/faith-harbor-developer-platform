/**
 * The ONE authoritative switch for how opted-in MARKETING mail is delivered.
 * It is a single value (never independent booleans) precisely so the legacy
 * direct-send path and the safeguarded outbox path can NEVER both send:
 *
 *  - `disabled` — no marketing sending at all. Neither the legacy drip
 *    direct-send nor the outbox worker will transmit marketing. This is the
 *    emergency-rollback target. TRANSACTIONAL email (verification, password
 *    reset, privacy, security, and the double-opt-in CONFIRMATION dispatch)
 *    keeps working regardless.
 *  - `legacy` — the historical path: `DripService.runDue/processOne` sends
 *    marketing directly; the outbox worker refuses to send marketing.
 *  - `outbox` — the safeguarded path: the marketing worker sends via the outbox
 *    (consent/suppression/limits/pause/metering/unsubscribe); the legacy
 *    direct-send refuses, and legacy auto-enroll triggers are disabled so no
 *    marketing can bypass consent/suppression/metering.
 *
 * Resolution is fail-safe:
 *  - UNSET → `legacy` (the documented safe default: preserve the exact
 *    pre-cutover production behaviour; nothing silently changes on deploy).
 *  - An UNRECOGNIZED value → `disabled` (fail closed — a misconfiguration must
 *    never fall through to an unintended sending path), with a loud warning.
 */
export type MarketingDeliveryMode = "disabled" | "legacy" | "outbox";

export const MARKETING_DELIVERY_MODES: readonly MarketingDeliveryMode[] = [
  "disabled",
  "legacy",
  "outbox",
];

export interface ResolvedDeliveryMode {
  mode: MarketingDeliveryMode;
  /** How the mode was chosen — for the startup banner (no secrets). */
  source: "default_unset" | "configured" | "invalid_failed_closed";
  /** The raw value seen, normalized — safe to log (it's a mode name, not a secret). */
  raw?: string;
}

export function resolveMarketingDeliveryMode(
  raw: string | undefined,
): ResolvedDeliveryMode {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === "") {
    return { mode: "legacy", source: "default_unset" };
  }
  if ((MARKETING_DELIVERY_MODES as readonly string[]).includes(value)) {
    return { mode: value as MarketingDeliveryMode, source: "configured", raw: value };
  }
  // Explicitly set but unrecognized → fail closed (no marketing sending).
  return { mode: "disabled", source: "invalid_failed_closed", raw: value };
}

/** Human-readable, secret-free one-liner for the startup banner. */
export function describeDeliveryMode(r: ResolvedDeliveryMode): string {
  const base = `marketing delivery mode = ${r.mode}`;
  if (r.source === "default_unset") {
    return `${base} (default; MARKETING_DELIVERY_MODE unset — preserving legacy behaviour)`;
  }
  if (r.source === "invalid_failed_closed") {
    return `${base} (FAILED CLOSED: MARKETING_DELIVERY_MODE="${r.raw}" is not one of disabled|legacy|outbox)`;
  }
  return base;
}
