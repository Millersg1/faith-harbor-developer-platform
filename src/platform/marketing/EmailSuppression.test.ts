import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { EmailTransport } from "../../communications/EmailTransport";
import { PlatformEmailService } from "../email/PlatformEmailService";
import { PlatformEmailRepository } from "../email/PlatformEmailRepository";
import { DripRepository } from "../drip/DripRepository";
import { DripService } from "../drip/DripService";
import {
  EmailSuppressionRepository,
  EmailSuppressionService,
  UnsubscribeService,
  UnsubscribeTokenRepository,
} from "./EmailSuppressionService";
import {
  DoubleOptInService,
  DoubleOptInTokenRepository,
} from "./DoubleOptInService";

describe("EmailSuppressionService — tenant vs global separation", () => {
  it("a tenant unsubscribe never affects another tenant", async () => {
    const svc = new EmailSuppressionService(new EmailSuppressionRepository());
    await svc.suppressTenant("orgA", "x@x.com");
    expect(await svc.marketingDeliverability("orgA", "x@x.com")).toEqual({
      eligible: false,
      reason: "unsubscribed",
    });
    // Tenant B is unaffected and cannot see A's status.
    expect(await svc.marketingDeliverability("orgB", "x@x.com")).toEqual({
      eligible: true,
    });
  });

  it("global suppression blocks all tenants but leaks nothing cross-tenant", async () => {
    const svc = new EmailSuppressionService(new EmailSuppressionRepository());
    await svc.suppressGlobal("bounce@x.com", "hard_bounce");
    // Both tenants see only the NEUTRAL "suppressed" — not the reason, not a
    // timestamp, not which tenant, and NOT "unsubscribed".
    for (const org of ["orgA", "orgB"]) {
      const d = await svc.marketingDeliverability(org, "bounce@x.com");
      expect(d.eligible).toBe(false);
      expect(d.reason).toBe("suppressed");
      expect(Object.keys(d)).toEqual(["eligible", "reason"]);
    }
  });

  it("transactional delivery ignores a tenant unsubscribe but honors global suppression", async () => {
    const svc = new EmailSuppressionService(new EmailSuppressionRepository());
    await svc.suppressTenant("orgA", "u@x.com"); // marketing unsubscribe
    await svc.suppressGlobal("g@x.com", "complaint"); // technical
    // A requested lead magnet still deliverable despite the marketing unsub…
    expect(await svc.transactionalDeliverability("u@x.com")).toEqual({
      eligible: true,
    });
    // …but NOT to a globally-suppressed (undeliverable/complaint) address.
    expect((await svc.transactionalDeliverability("g@x.com")).eligible).toBe(
      false,
    );
  });

  it("suppression is idempotent (repeat clicks are safe)", async () => {
    const svc = new EmailSuppressionService(new EmailSuppressionRepository());
    await svc.suppressTenant("orgA", "r@x.com");
    await svc.suppressTenant("orgA", "r@x.com");
    expect((await svc.marketingDeliverability("orgA", "r@x.com")).eligible).toBe(
      false,
    );
  });
});

describe("UnsubscribeService — token capability", () => {
  it("mint → unsubscribe suppresses the tenant; idempotent; bad token no-ops", async () => {
    const suppression = new EmailSuppressionService(
      new EmailSuppressionRepository(),
    );
    const unsub = new UnsubscribeService(
      new UnsubscribeTokenRepository(),
      suppression,
    );
    const token = await unsub.mint("orgA", "lead@x.com");
    expect(token).toMatch(/^[a-f0-9]{64}$/); // high-entropy

    expect(await unsub.unsubscribe(token)).toBe(true);
    expect(
      (await suppression.marketingDeliverability("orgA", "lead@x.com")).eligible,
    ).toBe(false);
    // Idempotent.
    expect(await unsub.unsubscribe(token)).toBe(true);
    // Unknown token resolves to nothing and suppresses nothing.
    expect(await unsub.unsubscribe("deadbeef")).toBe(false);
    // The token cannot resubscribe — there is no such operation.
    expect(
      (await suppression.marketingDeliverability("orgA", "lead@x.com")).eligible,
    ).toBe(false);
  });
});

describe("DoubleOptInService — confirmation token", () => {
  it("confirms once; replay/forged/expired fail safely; is tenant-scoped", async () => {
    let clock = 1_000_000;
    const svc = new DoubleOptInService(new DoubleOptInTokenRepository(), () => clock);
    const token = await svc.mint({
      organizationId: "orgA",
      email: "c@x.com",
      version: "v1",
    });
    const ok = await svc.confirm(token);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.organizationId).toBe("orgA");
      expect(ok.email).toBe("c@x.com");
    }
    // Replay → already used.
    expect(await svc.confirm(token)).toEqual({ ok: false, reason: "already_used" });
    // Forged → invalid.
    expect(await svc.confirm("nope")).toEqual({ ok: false, reason: "invalid" });

    // Expired.
    const t2 = await svc.mint({ organizationId: "orgA", email: "d@x.com" });
    clock += 73 * 60 * 60 * 1000;
    expect(await svc.confirm(t2)).toEqual({ ok: false, reason: "expired" });
  });
});

function captureEmail() {
  const sent: { to: string }[] = [];
  const transport: EmailTransport = {
    send: async (m) => {
      sent.push({ to: m.to });
      return { status: "sent", provider: "stub" };
    },
  };
  const email = new PlatformEmailService(
    new PlatformEmailRepository(),
    transport,
    { connected: true },
  );
  return { sent, email };
}

describe("drip pre-send eligibility (suppression rechecked before every send)", () => {
  it("skips a send to an unsubscribed recipient — cancels, records reason, does not send", async () => {
    const { sent, email } = captureEmail();
    const suppression = new EmailSuppressionService(
      new EmailSuppressionRepository(),
    );
    let clock = 1_000;
    const drip = new DripService(new DripRepository(), email, {
      now: () => clock,
      suppression,
    });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const seq = await drip.createSequence({ name: "N", trigger: "manual" });
      await drip.addStep(seq.id, { delayHours: 0, subject: "s", body: "b" });
      await drip.enroll(seq.id, "late@x.com", "Late");
      // Unsubscribe AFTER enrollment but BEFORE the send runs.
      await suppression.suppressTenant("orgA", "late@x.com");
      // Worker runs and touches the enrollment, but the queued message must NOT
      // go out (the `sent` array is the true meter).
      await drip.runDue();
      const enrollments = await drip.listEnrollments();
      expect(enrollments[0].status).toBe("canceled");
      expect(enrollments[0].lastEvent).toBe("skipped:unsubscribed");
    });
    expect(sent).toHaveLength(0); // nothing sent, nothing metered
  });

  it("still delivers to an eligible recipient", async () => {
    const { sent, email } = captureEmail();
    const suppression = new EmailSuppressionService(
      new EmailSuppressionRepository(),
    );
    let clock = 1_000;
    const drip = new DripService(new DripRepository(), email, {
      now: () => clock,
      suppression,
    });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const seq = await drip.createSequence({ name: "N", trigger: "manual" });
      await drip.addStep(seq.id, { delayHours: 0, subject: "s", body: "b" });
      await drip.enroll(seq.id, "ok@x.com", "Ok");
      expect(await drip.runDue()).toBe(1);
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ok@x.com");
  });
});
