import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { DripRepository } from "../drip/DripRepository";
import { DripService } from "../drip/DripService";
import {
  EmailSuppressionRepository,
  EmailSuppressionService,
} from "./EmailSuppressionService";
import {
  MarketingConsentRepository,
  MarketingConsentService,
} from "./MarketingConsentService";
import {
  MarketingOutboxRepository,
  MarketingOutboxService,
} from "./MarketingOutboxService";
import { MarketingEnrollmentReconciliation } from "./MarketingEnrollmentReconciliation";

function harness() {
  const dripRepo = new DripRepository();
  // Legacy mode so drip.enroll/addStep work as the historical engine.
  const drip = new DripService(dripRepo, undefined, { marketingMode: () => "legacy" });
  const consent = new MarketingConsentService(new MarketingConsentRepository());
  const suppression = new EmailSuppressionService(new EmailSuppressionRepository());
  const outboxRepo = new MarketingOutboxRepository();
  const outbox = new MarketingOutboxService(outboxRepo);
  const recon = new MarketingEnrollmentReconciliation({
    dripRepo,
    drip,
    outbox,
    consent,
    suppression,
  });
  return { dripRepo, drip, consent, suppression, outbox, outboxRepo, recon };
}

async function seedConsent(consent: MarketingConsentService, org: string, email: string) {
  await runWithTenant({ organizationId: org }, async () => {
    const rec = await consent.record({ email, version: "v1", doubleOptIn: true });
    await consent.confirm(rec.id);
  });
}

/** Create a 3-step sequence + an active enrollment currently at `stepIndex`. */
async function seedEnrollment(
  drip: DripService,
  dripRepo: DripRepository,
  org: string,
  email: string,
  stepIndex: number,
) {
  return runWithTenant({ organizationId: org }, async () => {
    const seq = await drip.createSequence({ name: "S" });
    for (let i = 0; i < 3; i += 1) {
      await drip.addStep(seq.id, { delayHours: 0, subject: `S${i}`, body: `B${i}` });
    }
    const enr = await drip.enroll(seq.id, email);
    // Simulate legacy progress: it has already sent steps < stepIndex.
    await dripRepo.updateEnrollment({ ...enr, stepIndex });
    return { seqId: seq.id, enrollmentId: enr.id };
  });
}

async function queued(repo: MarketingOutboxRepository) {
  return repo.claimDue(
    "peek",
    new Date(Date.now() + 5_000).toISOString(),
    new Date(Date.now() + 65_000).toISOString(),
    100,
  );
}

describe("MarketingEnrollmentReconciliation", () => {
  it("zero active enrollments → safe empty report (dry-run and real)", async () => {
    const h = harness();
    const dry = await h.recon.reconcile({ dryRun: true });
    expect(dry.scanned).toBe(0);
    expect(dry.seeded).toHaveLength(0);
    const real = await h.recon.reconcile({ dryRun: false });
    expect(real.scanned).toBe(0);
    expect(await queued(h.outboxRepo)).toHaveLength(0);
  });

  it("seeds ONLY the next unsent step; already-sent steps are never seeded", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "lead@x.com");
    const { enrollmentId } = await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 2);

    const report = await h.recon.reconcile({ dryRun: false });
    expect(report.seeded).toEqual([enrollmentId]);
    const rows = await queued(h.outboxRepo);
    expect(rows).toHaveLength(1);
    expect(rows[0].enrollmentId).toBe(enrollmentId);
    expect(rows[0].stepIndex).toBe(2); // the NEXT unsent step, not 0/1
  });

  it("is idempotent — a re-run seeds nothing new", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "lead@x.com");
    await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 1);
    const first = await h.recon.reconcile({ dryRun: false });
    expect(first.seeded).toHaveLength(1);
    const second = await h.recon.reconcile({ dryRun: false });
    expect(second.seeded).toHaveLength(0);
    expect(second.alreadySeeded).toBe(1);
    expect(await queued(h.outboxRepo)).toHaveLength(1); // no duplicate
  });

  it("dry-run reports would-seed but writes NO outbox rows", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "lead@x.com");
    await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 0);
    const dry = await h.recon.reconcile({ dryRun: true });
    expect(dry.seeded).toHaveLength(1);
    expect(await queued(h.outboxRepo)).toHaveLength(0);
  });

  it("no confirmed consent → skippedNoConsent (not seeded)", async () => {
    const h = harness();
    // no consent seeded
    await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 0);
    const r = await h.recon.reconcile({ dryRun: false });
    expect(r.skippedNoConsent).toBe(1);
    expect(r.seeded).toHaveLength(0);
  });

  it("suppressed → skippedSuppressed (not seeded)", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "lead@x.com");
    await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 0);
    await h.suppression.suppressTenant("orgA", "lead@x.com");
    const r = await h.recon.reconcile({ dryRun: false });
    expect(r.skippedSuppressed).toBe(1);
    expect(r.seeded).toHaveLength(0);
  });

  it("stepIndex past the last step → completed (nothing seeded)", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "lead@x.com");
    await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 3); // 3 steps, index 3 = done
    const r = await h.recon.reconcile({ dryRun: false });
    expect(r.completed).toBe(1);
    expect(r.seeded).toHaveLength(0);
  });

  it("an error marker on the enrollment → needs_attention (not seeded)", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "lead@x.com");
    const { enrollmentId } = await seedEnrollment(h.drip, h.dripRepo, "orgA", "lead@x.com", 0);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const enr = (await h.dripRepo.getEnrollment(enrollmentId))!;
      await h.dripRepo.updateEnrollment({ ...enr, lastEvent: "error:smtp" });
    });
    const r = await h.recon.reconcile({ dryRun: false });
    expect(r.needsAttention).toEqual([enrollmentId]);
    expect(r.seeded).toHaveLength(0);
  });

  it("processes multiple tenants in isolation; outbox rows carry the right org", async () => {
    const h = harness();
    await seedConsent(h.consent, "orgA", "a@x.com");
    await seedConsent(h.consent, "orgB", "b@x.com");
    await seedEnrollment(h.drip, h.dripRepo, "orgA", "a@x.com", 1);
    await seedEnrollment(h.drip, h.dripRepo, "orgB", "b@x.com", 1);
    const r = await h.recon.reconcile({ dryRun: false });
    expect(r.scanned).toBe(2);
    expect(r.seeded).toHaveLength(2);
    const rows = await queued(h.outboxRepo);
    expect(rows.map((x) => x.organizationId).sort()).toEqual(["orgA", "orgB"]);
    // No recipient PII in the report.
    expect(JSON.stringify(r)).not.toMatch(/@x\.com/);
  });
});
