/**
 * Autoresponder / drip email automation.
 *
 * A tenant builds a *sequence* of *steps* (each an email sent after a delay).
 * A recipient is *enrolled* — manually, or automatically when a matching
 * event fires (e.g. a new lead) — and a background tick walks each enrollment
 * through its steps, sending via the tenant's live email transport.
 */

/**
 * What causes a recipient to be enrolled into a sequence.
 * - `manual` — a person adds them.
 * - `lead_created` — CRM lead creation (internal/authenticated). NOT fired by
 *   public forms, which are consent-gated.
 * - `lead_magnet_requested` — a transactional trigger for delivering a requested
 *   asset; NOT marketing and NOT consent-gated.
 * - `marketing_opted_in` — ongoing marketing; fired ONLY after explicit
 *   affirmative consent (and, when configured, double-opt-in confirmation), and
 *   only for a non-suppressed recipient.
 */
export type DripTrigger =
  | "manual"
  | "lead_created"
  | "lead_magnet_requested"
  | "marketing_opted_in";

export const DRIP_TRIGGERS: readonly DripTrigger[] =
  ["manual", "lead_created", "lead_magnet_requested", "marketing_opted_in"];

export function isDripTrigger(
  value: unknown,
): value is DripTrigger {
  return (
    typeof value === "string" &&
    (DRIP_TRIGGERS as readonly string[]).includes(
      value,
    )
  );
}

/** Whether a sequence is currently sending. Paused sequences don't send. */
export type DripStatus =
  | "active"
  | "paused";

export interface DripSequenceRecord {
  id: string;
  organizationId: string;
  name: string;
  trigger: DripTrigger;
  status: DripStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DripStepRecord {
  id: string;
  organizationId: string;
  sequenceId: string;
  /** 0-based order within the sequence. */
  position: number;
  /** Hours to wait (from the previous step, or enrollment) before sending. */
  delayHours: number;
  subject: string;
  body: string;
  createdAt: string;
}

export type DripEnrollmentStatus =
  | "active"
  | "completed"
  | "canceled";

export interface DripEnrollmentRecord {
  id: string;
  organizationId: string;
  sequenceId: string;
  email: string;
  name?: string;
  /** Index of the NEXT step to send. */
  stepIndex: number;
  status: DripEnrollmentStatus;
  /** ISO timestamp the next step is due. */
  nextRunAt: string;
  /** Compact non-PII marker of the last action (sent/skipped/failed + reason). */
  lastEvent?: string;
  createdAt: string;
  updatedAt: string;
}

/** A due enrollment paired with its tenant, for the cross-tenant worker scan. */
export interface DueEnrollmentRef {
  id: string;
  organizationId: string;
}
