/**
 * PURE registration-lifecycle classifier (credential-free lifecycle release).
 *
 * It derives a lifecycle state STRICTLY from provider-reported facts:
 *  - if the provider POSITIVELY reports a registry lifecycle (grace / redemption
 *    / pending-delete / released / transfer), that wins — we NEVER invent it;
 *  - otherwise we derive a REMINDER state from the provider-confirmed expiration
 *    date against OUR configured reminder windows. These are reminder thresholds,
 *    not asserted TLD deadlines/grace/redemption/restoration facts.
 *
 * The output carries a confidence: `provider_reported` (registry lifecycle from
 * the provider), `derived` (from the provider expiry + our window), or `stale`
 * (set elsewhere when the provider is unreachable — never here).
 */

export type LifecycleState =
  | "active"
  | "upcoming_renewal"
  | "renewal_approaching"
  | "expiration_approaching"
  | "expired"
  | "grace"
  | "redemption"
  | "pending_delete"
  | "released"
  | "transfer_pending"
  | "transfer_completed"
  | "action_required"
  | "unknown";

export type LifecycleConfidence = "provider_reported" | "derived" | "stale";

export interface LifecycleWindows {
  upcomingDays: number; // e.g. 60
  renewalDays: number; // e.g. 30
  expirationDays: number; // e.g. 7
}

export const DEFAULT_LIFECYCLE_WINDOWS: LifecycleWindows = {
  upcomingDays: 60,
  renewalDays: 30,
  expirationDays: 7,
};

export interface ProviderFacts {
  registered: boolean;
  expiresAt?: string;
  /** The registry lifecycle string the PROVIDER reported (never invented). */
  lifecycleState?: string;
}

export interface Classification {
  state: LifecycleState;
  confidence: LifecycleConfidence;
  reason: string;
}

const DAY_MS = 86_400_000;

/** Maps a provider-reported registry lifecycle string to our state, or null. */
function fromProviderLifecycle(raw: string | undefined): LifecycleState | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("redempt")) return "redemption";
  if (s.includes("pendingdelete") || s.includes("pending_delete") || s.includes("pending delete")) return "pending_delete";
  if (s.includes("released") || s.includes("available")) return "released";
  if (s.includes("grace") || s.includes("autorenewperiod") || s.includes("renewperiod")) return "grace";
  if (s.includes("transfercompleted") || s.includes("transfer_completed")) return "transfer_completed";
  if (s.includes("transfer")) return "transfer_pending";
  if (s.includes("verif") || s.includes("action") || s.includes("hold")) return "action_required";
  return null;
}

export function classifyLifecycle(
  facts: ProviderFacts,
  nowMs: number,
  windows: LifecycleWindows = DEFAULT_LIFECYCLE_WINDOWS,
): Classification {
  // 1. A positively-reported registry lifecycle from the provider ALWAYS wins.
  const provided = fromProviderLifecycle(facts.lifecycleState);
  if (provided) {
    return { state: provided, confidence: "provider_reported", reason: "provider_lifecycle" };
  }
  // 2. A provider that says the domain is not registered is an action item.
  if (!facts.registered) {
    return { state: "action_required", confidence: "provider_reported", reason: "not_registered" };
  }
  // 3. Otherwise derive a REMINDER state from the provider expiry + our windows.
  if (!facts.expiresAt) {
    return { state: "unknown", confidence: "derived", reason: "no_expiry" };
  }
  const remainingMs = Date.parse(facts.expiresAt) - nowMs;
  if (Number.isNaN(remainingMs)) return { state: "unknown", confidence: "derived", reason: "bad_expiry" };
  if (remainingMs <= 0) return { state: "expired", confidence: "derived", reason: "past_expiry" };
  if (remainingMs <= windows.expirationDays * DAY_MS) return { state: "expiration_approaching", confidence: "derived", reason: "within_expiration_window" };
  if (remainingMs <= windows.renewalDays * DAY_MS) return { state: "renewal_approaching", confidence: "derived", reason: "within_renewal_window" };
  if (remainingMs <= windows.upcomingDays * DAY_MS) return { state: "upcoming_renewal", confidence: "derived", reason: "within_upcoming_window" };
  return { state: "active", confidence: "derived", reason: "not_near_expiry" };
}

/** The reminder notice (if any) a state should raise. */
export function reminderNoticeFor(state: LifecycleState): string | null {
  switch (state) {
    case "upcoming_renewal":
    case "renewal_approaching":
      return "renewal_reminder";
    case "expiration_approaching":
    case "expired":
    case "grace":
    case "redemption":
    case "pending_delete":
      return "expiration_grace_redemption_warning";
    case "action_required":
      return "contact_verification_required";
    default:
      return null;
  }
}
