import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import type {
  DeliveryRequest,
  DeliveryResult,
  EmailDeliveryProvider,
} from "../email/EmailDeliveryProvider";
import { DripRepository } from "../drip/DripRepository";
import { DripService } from "../drip/DripService";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
import {
  EmailSuppressionRepository,
  EmailSuppressionService,
  UnsubscribeService,
  UnsubscribeTokenRepository,
} from "./EmailSuppressionService";
import {
  MarketingConsentRepository,
  MarketingConsentService,
} from "./MarketingConsentService";
import {
  MarketingSenderRepository,
  MarketingSenderService,
} from "./MarketingSenderService";
import type { OutboxMessage } from "./MarketingOutboxService";
import {
  createMarketingEligibility,
  createMarketingSend,
} from "./marketingSendComposition";

const ORG = "orgA";
const EMAIL = "lead@x.com";

function msg(over: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: "o1",
    organizationId: ORG,
    enrollmentId: null,
    sequenceId: null,
    stepIndex: 0,
    email: EMAIL,
    subject: "Hello",
    body: "Body text",
    status: "sending",
    attempts: 0,
    nextAttemptAt: "t",
    leaseOwner: "w",
    leaseUntil: "t",
    providerId: null,
    messageIdHeader: null,
    reason: null,
    resolvedAt: null,
    createdAt: "t",
    updatedAt: "t",
    ...over,
  };
}

class CaptureProvider implements EmailDeliveryProvider {
  readonly name = "capture";
  readonly sent: DeliveryRequest[] = [];
  result: DeliveryResult = {
    classification: "accepted",
    providerId: "mid",
    responseCategory: "accepted",
    acceptedCount: 1,
    rejectedCount: 0,
  };
  async deliver(r: DeliveryRequest): Promise<DeliveryResult> {
    this.sent.push(r);
    return this.result;
  }
}

async function grantConfirmed(consent: MarketingConsentService) {
  await runWithTenant({ organizationId: ORG }, async () => {
    const rec = await consent.record({ email: EMAIL, version: "v1", doubleOptIn: true });
    await consent.confirm(rec.id);
  });
}

async function configureSender(sender: MarketingSenderService) {
  await runWithTenant({ organizationId: ORG }, () =>
    sender.set(
      { businessName: "Acme Co", replyTo: "hi@acme.com", physicalAddress: "1 Main St" },
      "owner",
    ),
  );
}

function eligibilityHarness() {
  const consent = new MarketingConsentService(new MarketingConsentRepository());
  const suppression = new EmailSuppressionService(new EmailSuppressionRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository());
  const drip = new DripService(new DripRepository());
  const marketingSender = new MarketingSenderService(new MarketingSenderRepository());
  const eligible = createMarketingEligibility({ consent, suppression, leads, drip, marketingSender });
  return { consent, suppression, leads, drip, marketingSender, eligible };
}

describe("createMarketingEligibility — specific durable decisions", () => {
  it("all gates pass → send", async () => {
    const h = eligibilityHarness();
    await grantConfirmed(h.consent);
    await configureSender(h.marketingSender);
    expect((await h.eligible(msg())).kind).toBe("send");
  });

  it("consent withdrawn/unconfirmed → skip", async () => {
    const h = eligibilityHarness();
    await configureSender(h.marketingSender);
    expect((await h.eligible(msg())).kind).toBe("skip");
  });

  it("suppressed → skip", async () => {
    const h = eligibilityHarness();
    await grantConfirmed(h.consent);
    await configureSender(h.marketingSender);
    await h.suppression.suppressTenant(ORG, EMAIL);
    const d = await h.eligible(msg());
    expect(d.kind).toBe("skip");
    expect(d.kind === "skip" && d.reason).toMatch(/suppressed/);
  });

  it("lost lead → skip", async () => {
    const h = eligibilityHarness();
    await grantConfirmed(h.consent);
    await configureSender(h.marketingSender);
    await runWithTenant({ organizationId: ORG }, () =>
      h.leads.create({ name: "L", email: EMAIL, status: "lost" }),
    );
    expect((await h.eligible(msg())).kind).toBe("skip");
  });

  it("sender not configured → needs_attention (not an endless retry)", async () => {
    const h = eligibilityHarness();
    await grantConfirmed(h.consent);
    // sender left unconfigured
    const d = await h.eligible(msg());
    expect(d.kind).toBe("needs_attention");
    expect(d.kind === "needs_attention" && d.reason).toMatch(/sender_/);
  });

  it("paused bound sequence → defer (retry later, not a failure)", async () => {
    const h = eligibilityHarness();
    await grantConfirmed(h.consent);
    await configureSender(h.marketingSender);
    const seqId = await runWithTenant({ organizationId: ORG }, async () => {
      const s = await h.drip.createSequence({ name: "S" });
      await h.drip.addStep(s.id, { delayHours: 0, subject: "x", body: "y" });
      await h.drip.setStatus(s.id, "paused");
      return s.id;
    });
    expect((await h.eligible(msg({ sequenceId: seqId }))).kind).toBe("defer");
  });
});

describe("createMarketingSend — marketing message with unsubscribe headers", () => {
  it("includes List-Unsubscribe + one-click and marks the message class marketing", async () => {
    const sender = new MarketingSenderService(new MarketingSenderRepository());
    await configureSender(sender);
    const provider = new CaptureProvider();
    const unsubscribe = new UnsubscribeService(
      new UnsubscribeTokenRepository(),
      new EmailSuppressionService(new EmailSuppressionRepository()),
    );
    const send = createMarketingSend({
      marketingSender: sender,
      emailProvider: provider,
      unsubscribe,
      unsubscribeBase: "https://allelitecloud.com",
    });
    const res = await send(msg({ enrollmentId: "enr-1", stepIndex: 0 }));
    expect(res.classification).toBe("accepted");
    const sent = provider.sent[0];
    expect(sent.messageClass).toBe("marketing");
    const headerKeys = Object.keys(sent.headers ?? {}).map((k) => k.toLowerCase());
    expect(headerKeys).toContain("list-unsubscribe");
    expect(headerKeys).toContain("list-unsubscribe-post");
    expect(JSON.stringify(sent.headers)).toMatch(/one-click/i);
  });

  it("resolves the sender at SEND time — a removed sender stops the send (retryable)", async () => {
    const sender = new MarketingSenderService(new MarketingSenderRepository()); // never configured
    const provider = new CaptureProvider();
    const unsubscribe = new UnsubscribeService(
      new UnsubscribeTokenRepository(),
      new EmailSuppressionService(new EmailSuppressionRepository()),
    );
    const send = createMarketingSend({
      marketingSender: sender,
      emailProvider: provider,
      unsubscribe,
      unsubscribeBase: "https://allelitecloud.com",
    });
    const res = await send(msg());
    expect(res.classification).toBe("pre_acceptance_failure");
    expect(provider.sent).toHaveLength(0); // never transmitted
  });
});
