import { runWithTenant } from "../../tenancy/TenantContext";
import type { DripRepository } from "../drip/DripRepository";
import type { DripService } from "../drip/DripService";
import type { MarketingOutboxService } from "./MarketingOutboxService";
import type { MarketingConsentService } from "./MarketingConsentService";
import type { EmailSuppressionService } from "./EmailSuppressionService";

/**
 * Idempotent, dry-run-capable reconciliation of EXISTING active legacy drip
 * enrollments into the safeguarded outbox, for the one-time legacy→outbox
 * cutover.
 *
 * Safety by construction:
 *  - It seeds ONLY the next genuinely-unsent step (`enrollment.stepIndex`, the
 *    index of the NEXT step to send). Already-sent steps (< stepIndex) are never
 *    touched, so no message that may already have been sent is recreated.
 *  - Seeding uses the outbox's `(enrollment_id, step_index)` idempotency, so a
 *    re-run never duplicates — it reports `alreadySeeded` instead.
 *  - It does NOT modify the enrollment (timestamps/history preserved).
 *  - Each enrollment is processed in ITS OWN tenant scope; the outbox row
 *    carries that org. Tenant boundaries are never crossed.
 *  - Ambiguous records (missing sequence/steps, an error marker, a stepIndex
 *    past the end) become `needs_attention` and are NOT seeded.
 *  - Consent + suppression are rechecked; ineligible enrollments are skipped.
 *  - The report contains enrollment IDs + counts only — NEVER recipient PII.
 */
export interface ReconcileReport {
  dryRun: boolean;
  scanned: number;
  /** Enrollment ids for which the next unsent step was (or would be) seeded. */
  seeded: string[];
  /** Already had their next step in the outbox (idempotent re-run). */
  alreadySeeded: number;
  skippedSuppressed: number;
  skippedNoConsent: number;
  skippedSequencePaused: number;
  /** Enrollment ids needing manual review (ambiguous/inconsistent). */
  needsAttention: string[];
  /** Active but already past their last step. */
  completed: number;
}

function emptyReport(dryRun: boolean): ReconcileReport {
  return {
    dryRun,
    scanned: 0,
    seeded: [],
    alreadySeeded: 0,
    skippedSuppressed: 0,
    skippedNoConsent: 0,
    skippedSequencePaused: 0,
    needsAttention: [],
    completed: 0,
  };
}

export class MarketingEnrollmentReconciliation {
  constructor(
    private readonly deps: {
      dripRepo: DripRepository;
      drip: DripService;
      outbox: MarketingOutboxService;
      consent: MarketingConsentService;
      suppression: EmailSuppressionService;
    },
  ) {}

  /**
   * Reconcile all active legacy enrollments. `dryRun` computes what WOULD be
   * seeded without writing any outbox rows. Pages deterministically by
   * created_at so it is safe to resume.
   */
  async reconcile(
    opts: { dryRun: boolean; pageSize?: number } = { dryRun: true },
  ): Promise<ReconcileReport> {
    const report = emptyReport(opts.dryRun);
    const pageSize = opts.pageSize ?? 200;
    let after: string | undefined;

    for (;;) {
      const refs = await this.deps.dripRepo.activeRefs(pageSize, after);
      if (refs.length === 0) break;
      for (const ref of refs) {
        report.scanned += 1;
        await runWithTenant({ organizationId: ref.organizationId }, () =>
          this.reconcileOne(ref.id, ref.organizationId, report),
        );
      }
      if (refs.length < pageSize) break;
      // Advance the cursor by the LAST ref's created_at (fetched in its own
      // tenant scope, since getEnrollment is tenant-scoped).
      const lastRef = refs[refs.length - 1];
      const last = await runWithTenant(
        { organizationId: lastRef.organizationId },
        () => this.deps.dripRepo.getEnrollment(lastRef.id),
      );
      if (!last) break;
      after = last.createdAt;
    }
    return report;
  }

  private async reconcileOne(
    id: string,
    org: string,
    report: ReconcileReport,
  ): Promise<void> {
    const enr = await this.deps.dripRepo.getEnrollment(id);
    // Raced away (canceled/completed) since the scan — nothing to do.
    if (!enr || enr.status !== "active") return;
    if (enr.organizationId !== org) {
      report.needsAttention.push(id);
      return;
    }
    // An error marker on the legacy enrollment is ambiguous — review, don't seed.
    if (enr.lastEvent && /^error/i.test(enr.lastEvent)) {
      report.needsAttention.push(id);
      return;
    }
    // Bound sequence must exist, be owned, and (for seeding) be active.
    let sequenceActive = false;
    try {
      const seq = await this.deps.drip.getSequence(enr.sequenceId);
      if (seq.organizationId !== org) {
        report.needsAttention.push(id);
        return;
      }
      sequenceActive = seq.status === "active";
    } catch {
      report.needsAttention.push(id);
      return;
    }
    const steps = await this.deps.drip.listSteps(enr.sequenceId);
    if (steps.length === 0) {
      report.needsAttention.push(id);
      return;
    }
    // stepIndex is the NEXT step to send. Past the end → effectively complete.
    if (enr.stepIndex >= steps.length) {
      report.completed += 1;
      return;
    }
    if (!sequenceActive) {
      report.skippedSequencePaused += 1;
      return;
    }
    // Current eligibility (consent + tenant/global suppression).
    if (!(await this.deps.consent.hasConfirmedConsent(enr.email))) {
      report.skippedNoConsent += 1;
      return;
    }
    if (
      !(await this.deps.suppression.marketingDeliverability(org, enr.email))
        .eligible
    ) {
      report.skippedSuppressed += 1;
      return;
    }
    // Seed ONLY the next genuinely-unsent step. Idempotent on (enrollment, step).
    const step = steps[enr.stepIndex];
    if (report.dryRun) {
      report.seeded.push(id); // would-seed
      return;
    }
    const seeded = await this.deps.outbox.enqueue({
      organizationId: org,
      enrollmentId: enr.id,
      sequenceId: enr.sequenceId,
      stepIndex: enr.stepIndex,
      email: enr.email,
      subject: step.subject,
      body: step.body,
    });
    if (seeded) report.seeded.push(id);
    else report.alreadySeeded += 1;
  }
}
