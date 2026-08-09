import { runWithTenant } from "../../tenancy/TenantContext";
import type { DripService } from "../drip/DripService";
import type { PlatformLeadService } from "../crm/PlatformLeadService";
import type { EmailSuppressionService } from "./EmailSuppressionService";
import type { MarketingConsentService } from "./MarketingConsentService";
import type { MarketingOutboxService } from "./MarketingOutboxService";
import type {
  ActivationGates,
  ActivationRecord,
} from "./MarketingActivationService";

/**
 * Build the {@link ActivationGates} that turn a `ready` marketing activation
 * into exactly ONE active enrollment + ONE idempotent first outbox step.
 *
 * The DB is the final concurrency guard:
 *  - `drip.enroll` returns the EXISTING active enrollment when one exists
 *    (`drip_enrollments_active_uniq`), so no duplicate active enrollment.
 *  - `outbox.enqueue` is idempotent on `(enrollment_id, step_index)`
 *    (`marketing_outbox_step_uniq`), so no duplicate first-step row.
 * Re-running after a crash/restart therefore converges: the enroll gate returns
 * `"duplicate"` (→ `already_enrolled`) once the first step is already seeded.
 *
 * No SMTP happens here — the gate only creates durable rows. The actual send
 * (with its own final eligibility recheck) is the worker's job.
 */
export function createActivationGates(deps: {
  consent: MarketingConsentService;
  suppression: EmailSuppressionService;
  leads: PlatformLeadService;
  drip: DripService;
  outbox: MarketingOutboxService;
}): ActivationGates {
  const inTenant = <T>(a: ActivationRecord, fn: () => Promise<T>): Promise<T> =>
    runWithTenant({ organizationId: a.organizationId }, fn);

  return {
    // Affirmative, matching, and (when required) confirmed consent.
    consentOk: (a) =>
      inTenant(a, async () => {
        const latest = await deps.consent.latestForEmail(a.email);
        if (!latest || !latest.granted) return false;
        if (a.consentVersion && latest.version !== a.consentVersion) return false;
        // Double opt-in required → a confirmation must be on file.
        if (a.doubleOptIn && !latest.confirmedAt) return false;
        return true;
      }),

    // Tenant OR global suppression.
    suppressed: async (a) =>
      !(await deps.suppression.marketingDeliverability(a.organizationId, a.email))
        .eligible,

    // Lead considered active unless it exists and is explicitly 'lost'. A missing
    // lead never blocks a confirmed marketing opt-in.
    leadActive: (a) =>
      inTenant(a, async () => {
        const lead = await deps.leads.findByEmail(a.email);
        return !lead || lead.status !== "lost";
      }),

    // The BOUND sequence must still exist, belong to this tenant, and be active.
    sequenceValid: (a) =>
      inTenant(a, async () => {
        try {
          const seq = await deps.drip.getSequence(a.sequenceId);
          if (seq.organizationId !== a.organizationId) return "wrong_tenant";
          return seq.status === "active" ? "ok" : "inactive";
        } catch {
          return "not_found";
        }
      }),

    // Create/locate the one active enrollment and seed the first step once.
    enroll: (a) =>
      inTenant(a, async () => {
        const enrollment = await deps.drip.enroll(a.sequenceId, a.email);
        const steps = await deps.drip.listSteps(a.sequenceId);
        const first = steps[0];
        if (!first) return "duplicate"; // nothing to seed (guarded upstream)
        const seeded = await deps.outbox.enqueue({
          organizationId: a.organizationId,
          enrollmentId: enrollment.id,
          sequenceId: a.sequenceId,
          stepIndex: 0,
          email: a.email,
          subject: first.subject,
          body: first.body,
        });
        return seeded ? "enrolled" : "duplicate";
      }),
  };
}
