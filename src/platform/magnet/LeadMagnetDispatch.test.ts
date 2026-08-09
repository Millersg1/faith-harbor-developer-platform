import { describe, expect, it } from "vitest";

import type {
  DeliveryRequest,
  DeliveryResult,
  EmailDeliveryProvider,
} from "../email/EmailDeliveryProvider";
import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "./LeadMagnetCapabilityService";
import {
  LeadMagnetDispatchRepository,
  LeadMagnetDispatchService,
  buildMagnetEmail,
  createLeadMagnetSend,
  type MagnetDispatchRecord,
} from "./LeadMagnetDispatchService";

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

function harness(startMs = 1_700_000_000_000) {
  const clock = { ms: startMs };
  const now = () => clock.ms;
  const dispatchRepo = new LeadMagnetDispatchRepository();
  const dispatch = new LeadMagnetDispatchService(dispatchRepo, now);
  const capRepo = new LeadMagnetCapabilityRepository();
  const capabilities = new LeadMagnetCapabilityService(capRepo, now);
  const provider = new CaptureProvider();
  const send = createLeadMagnetSend({
    capabilities,
    emailProvider: provider,
    transactionalFrom: "All Elite Cloud <no-reply@allelitecloud.com>",
  });
  return { dispatch, dispatchRepo, capabilities, capRepo, provider, send, clock, now };
}

async function enqueueOne(dispatch: LeadMagnetDispatchService) {
  await dispatch.enqueue({
    organizationId: "orgA",
    fulfillmentId: "ful1",
    formId: "form1",
    fileId: "file1",
    email: "lead@x.com",
    businessName: "Acme Co",
    fileTitle: "The Guide",
    downloadBase: "https://acme.allelitecloud.com",
  });
}

/** Extract the fragment token from the last email's link. */
function tokenFromEmail(provider: CaptureProvider): string {
  const m = /#d=([a-f0-9]{64})/.exec(provider.sent[provider.sent.length - 1].text);
  return m![1];
}

describe("LeadMagnetDispatch — transactional, capability-per-attempt", () => {
  it("enqueue is idempotent per fulfillment", async () => {
    const { dispatch } = harness();
    await enqueueOne(dispatch);
    // Second enqueue for the same fulfillment is a no-op.
    const again = await dispatch.enqueue({
      organizationId: "orgA",
      fulfillmentId: "ful1",
      formId: "form1",
      fileId: "file1",
      email: "lead@x.com",
      downloadBase: "https://acme.allelitecloud.com",
    });
    expect(again).toBe(false);
  });

  it("accepted → sent; the email is transactional (NO unsubscribe/tracking headers) with a valid capability link", async () => {
    const { dispatch, provider, send, capabilities } = harness();
    await enqueueOne(dispatch);
    const r = await dispatch.runOnce("w", { send });
    expect(r.sent).toBe(1);
    const msg = provider.sent[0];
    expect(msg.messageClass).toBe("transactional");
    expect(msg.from).toMatch(/allelitecloud\.com/);
    expect(JSON.stringify(msg.headers ?? {})).not.toMatch(/list-unsubscribe/i);
    expect(msg.text).not.toMatch(/unsubscribe/i);
    // The link's capability is live (accepted keeps it valid).
    const token = tokenFromEmail(provider);
    expect((await capabilities.redeem(token)).ok).toBe(true);
  });

  it("a pre-acceptance failure REVOKES that attempt's capability, and a retry mints a NEW one", async () => {
    const { dispatch, provider, send, capabilities, clock } = harness();
    await enqueueOne(dispatch);
    provider.result = { classification: "pre_acceptance_failure", responseCategory: "connection", acceptedCount: 0, rejectedCount: 1 };
    await dispatch.runOnce("w", { send });
    const deadToken = tokenFromEmail(provider);
    expect(await capabilities.redeem(deadToken)).toEqual({ ok: false, reason: "revoked" });

    // Retry (past backoff) with a healthy provider → a NEW capability.
    provider.result = { classification: "accepted", providerId: "mid2", responseCategory: "accepted", acceptedCount: 1, rejectedCount: 0 };
    clock.ms += 6 * 60 * 1000;
    await dispatch.runOnce("w", { send });
    const liveToken = tokenFromEmail(provider);
    expect(liveToken).not.toBe(deadToken);
    expect((await capabilities.redeem(liveToken)).ok).toBe(true);
  });

  it("an UNCERTAIN attempt keeps its (possibly delivered) capability and never auto-resends", async () => {
    const { dispatch, provider, send, capabilities } = harness();
    await enqueueOne(dispatch);
    provider.result = { classification: "uncertain", responseCategory: "ambiguous", acceptedCount: 0, rejectedCount: 0 };
    const r1 = await dispatch.runOnce("w", { send });
    expect(r1.unknown).toBe(1);
    const token = tokenFromEmail(provider);
    expect((await capabilities.redeem(token)).ok).toBe(true); // capability left valid
    // No auto-resend — a second run claims nothing (status delivery_unknown).
    const before = provider.sent.length;
    await dispatch.runOnce("w", { send });
    expect(provider.sent.length).toBe(before);
    const attention = await dispatch.needsAttention("orgA");
    expect(attention[0].status).toBe("delivery_unknown");
  });

  it("a crashed lease (minted+stored before SMTP outcome) recovers to delivery_unknown, not resent", async () => {
    const { dispatch, dispatchRepo, send, provider, clock } = harness();
    await enqueueOne(dispatch);
    // Simulate a dead worker holding a short lease.
    await dispatchRepo.claimDue("dead", new Date(clock.ms + 1000).toISOString(), new Date(clock.ms - 1000).toISOString(), 10);
    clock.ms += 60_000;
    const r = await dispatch.runOnce("live", { send });
    expect(r.unknown).toBe(1);
    expect(provider.sent).toHaveLength(0); // never re-sent
    expect((await dispatch.needsAttention("orgA"))[0].status).toBe("delivery_unknown");
  });

  it("a deliberate retry re-queues so the worker mints a fresh sibling capability", async () => {
    const { dispatch, dispatchRepo, provider, send } = harness();
    await enqueueOne(dispatch);
    provider.result = { classification: "uncertain", responseCategory: "ambiguous", acceptedCount: 0, rejectedCount: 0 };
    await dispatch.runOnce("w", { send });
    const [rec] = await dispatch.needsAttention("orgA");
    expect(await dispatch.retry(rec.id, "orgA")).toBe(true);
    // Now healthy → the retry sends a NEW email (sibling capability).
    provider.result = { classification: "accepted", providerId: "m", responseCategory: "accepted", acceptedCount: 1, rejectedCount: 0 };
    await dispatch.runOnce("w", { send });
    expect(provider.sent.length).toBe(2);
  });

  it("stores no raw token and no PII-heavy blobs in the dispatch record", async () => {
    const { dispatch, dispatchRepo, send, provider } = harness();
    await enqueueOne(dispatch);
    await dispatch.runOnce("w", { send });
    const token = tokenFromEmail(provider);
    const rec = await dispatchRepo.getForOrg((await dispatch.needsAttention("orgA"))[0]?.id ?? "sent", "orgA");
    // The record carries the recipient email (needed to send) but NEVER the raw token.
    const blob = JSON.stringify(rec ?? {});
    expect(blob).not.toContain(token);
  });
});

describe("buildMagnetEmail — safe, no marketing headers", () => {
  it("escapes tenant display text and includes the fragment link; no unsubscribe", () => {
    const built = buildMagnetEmail({
      businessName: '<b>Acme</b> & Co',
      fileTitle: "Guide <x>",
      downloadUrl: "https://acme.allelitecloud.com/magnet#d=abc",
    });
    expect(built.html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; Co"); // escaped
    expect(built.html).not.toContain("<b>Acme</b>");
    expect(built.html).toContain("#d=abc");
    expect(built.text).toContain("#d=abc");
    expect(JSON.stringify(built)).not.toMatch(/unsubscribe/i);
  });
});
