import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { DripRepository } from "../drip/DripRepository";
import { DripService } from "../drip/DripService";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
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
import {
  MarketingActivationRepository,
  MarketingActivationService,
} from "./MarketingActivationService";
import { createActivationGates } from "./marketingActivationGates";

const ORG = "orgA";
const EMAIL = "lead@x.com";

async function harness() {
  const drip = new DripService(new DripRepository());
  const consent = new MarketingConsentService(new MarketingConsentRepository());
  const suppression = new EmailSuppressionService(new EmailSuppressionRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository());
  const outboxRepo = new MarketingOutboxRepository();
  const outbox = new MarketingOutboxService(outboxRepo);
  const activations = new MarketingActivationService(new MarketingActivationRepository());
  const gates = createActivationGates({ consent, suppression, leads, drip, outbox });

  // A sequence with one step, in the tenant.
  const sequenceId = await runWithTenant({ organizationId: ORG }, async () => {
    const seq = await drip.createSequence({ name: "Welcome", trigger: "marketing_opted_in" });
    await drip.addStep(seq.id, { delayHours: 0, subject: "Hi", body: "Welcome!" });
    return seq.id;
  });

  return { drip, consent, suppression, leads, outbox, outboxRepo, activations, gates, sequenceId };
}

async function grantConfirmedConsent(consent: MarketingConsentService, version = "v1") {
  await runWithTenant({ organizationId: ORG }, async () => {
    const rec = await consent.record({ email: EMAIL, version, doubleOptIn: true });
    await consent.confirm(rec.id);
  });
}

async function readyActivation(
  activations: MarketingActivationService,
  sequenceId: string,
  version = "v1",
) {
  return activations.createIntent({
    organizationId: ORG,
    formId: null,
    sequenceId,
    email: EMAIL,
    consentVersion: version,
    doubleOptIn: true,
    ready: true, // already confirmed → ready to process
  });
}

/** Peek queued outbox rows (leasing them). */
async function queuedRows(repo: MarketingOutboxRepository) {
  return repo.claimDue(
    "peek",
    new Date(Date.now() + 5_000).toISOString(),
    new Date(Date.now() + 65_000).toISOString(),
    100,
  );
}

describe("activation processing — one enrollment + one first step", () => {
  it("enrolls once and seeds exactly one first outbox step", async () => {
    const h = await harness();
    await grantConfirmedConsent(h.consent);
    await readyActivation(h.activations, h.sequenceId);

    const results = await h.activations.activateReady(h.gates);
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("enrolled");

    const enrollments = await runWithTenant({ organizationId: ORG }, () =>
      h.drip.listEnrollments(),
    );
    const active = enrollments.filter((e) => e.email === EMAIL && e.status === "active");
    expect(active).toHaveLength(1);

    const rows = await queuedRows(h.outboxRepo);
    expect(rows.filter((r) => r.enrollmentId === active[0].id && r.stepIndex === 0)).toHaveLength(1);
  });

  it("is idempotent across crash/restart: re-running the enroll gate makes no duplicate", async () => {
    const h = await harness();
    await grantConfirmedConsent(h.consent);
    const a = await readyActivation(h.activations, h.sequenceId);

    // First enroll → "enrolled"; a crash before marking enrolled → re-run.
    expect(await h.gates.enroll(a)).toBe("enrolled");
    expect(await h.gates.enroll(a)).toBe("duplicate"); // DB uniqueness guards
    expect(await h.gates.enroll(a)).toBe("duplicate");

    const enrollments = await runWithTenant({ organizationId: ORG }, () =>
      h.drip.listEnrollments(),
    );
    expect(enrollments.filter((e) => e.email === EMAIL && e.status === "active")).toHaveLength(1);
    const rows = await queuedRows(h.outboxRepo);
    expect(rows.filter((r) => r.stepIndex === 0)).toHaveLength(1);
  });
});

describe("activation processing — gate outcomes are specific & durable", () => {
  it("suppressed → skipped, no enrollment", async () => {
    const h = await harness();
    await grantConfirmedConsent(h.consent);
    await h.suppression.suppressTenant(ORG, EMAIL);
    await readyActivation(h.activations, h.sequenceId);
    const [r] = await h.activations.activateReady(h.gates);
    expect(r.outcome).toBe("suppressed");
    expect(await queuedRows(h.outboxRepo)).toHaveLength(0);
  });

  it("missing/unconfirmed consent → not enrolled (consent_missing)", async () => {
    const h = await harness();
    // No consent recorded at all.
    await readyActivation(h.activations, h.sequenceId);
    const [r] = await h.activations.activateReady(h.gates);
    expect(r.outcome).toBe("consent_missing");
    expect(await queuedRows(h.outboxRepo)).toHaveLength(0);
  });

  it("a 'lost' lead → skipped (lead_inactive)", async () => {
    const h = await harness();
    await grantConfirmedConsent(h.consent);
    await runWithTenant({ organizationId: ORG }, () =>
      h.leads.create({ name: "L", email: EMAIL, status: "lost" }),
    );
    await readyActivation(h.activations, h.sequenceId);
    const [r] = await h.activations.activateReady(h.gates);
    expect(r.outcome).toBe("lead_inactive");
  });

  it("a paused sequence → not enrolled (sequence_inactive)", async () => {
    const h = await harness();
    await grantConfirmedConsent(h.consent);
    await runWithTenant({ organizationId: ORG }, () => h.drip.setStatus(h.sequenceId, "paused"));
    await readyActivation(h.activations, h.sequenceId);
    const [r] = await h.activations.activateReady(h.gates);
    expect(r.outcome).toBe("sequence_inactive");
    expect(await queuedRows(h.outboxRepo)).toHaveLength(0);
  });
});
