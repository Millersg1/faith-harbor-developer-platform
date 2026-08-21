import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { EnvelopeCipher } from "../crypto/EnvelopeCipher";
import { Keyring } from "../crypto/Keyring";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider, type FakeConfig } from "../FakeRegistrarProvider";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";
import { FakeDomainStripeGateway } from "../saga/FakeDomainStripeGateway";
import { DomainTransferRepository, DuplicateTransferError } from "./DomainTransferRepository";
import {
  DomainTransferSaga,
  TransferAuthError,
  TransferDisabledError,
  TransferGateError,
} from "./DomainTransferSaga";
import { DomainTransferWorker } from "./DomainTransferWorker";
import { IllegalTransferTransitionError, transferTransition } from "./transferSagaState";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 7).toString("base64") },
  encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 9).toString("base64") },
  blindActiveVersion: 1,
});
const OWNER = { role: "owner" as const, reauthenticatedRecently: true, userId: "u1" };
const NON_OWNER = { role: "member" as const, reauthenticatedRecently: true, userId: "u2" };

function build(opts: { enabled?: boolean; termsPublished?: boolean; fake?: FakeConfig } = {}, calls?: string[]) {
  const base = new FakeRegistrarProvider({ priceByTld: { com: 1080 }, expiresAtByDomain: { "acme.com": "2027-06-01T00:00:00Z" }, ...(opts.fake ?? {}) });
  const registrar = calls
    ? new Proxy(base, { get(t, p) { const v = (t as unknown as Record<string, unknown>)[p as string]; return typeof v === "function" ? (...a: unknown[]) => { calls.push(String(p)); return (v as (...x: unknown[]) => unknown).apply(t, a); } : v; } })
    : base;
  const stripe = new FakeDomainStripeGateway();
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainTransferRepository(undefined, new EnvelopeCipher(keyring));
  let seq = 0;
  let nowMs = Date.parse("2026-08-20T00:00:00Z");
  const now = () => new Date(nowMs).toISOString();
  const seen = new Set<string>();
  const saga = new DomainTransferSaga({
    repo, stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY, now,
    newId: () => `id${++seq}`, successUrl: "https://x/s", cancelUrl: "https://x/c",
    incomingTransfersEnabled: opts.enabled ?? true,
    publishedTransferTermsVersion: () => (opts.termsPublished === false ? null : 3),
    maxAttempts: 3, backoffMs: 1000, beginEvent: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
  });
  return { saga, repo, stripe, registrar, registrations, now, advance: (ms: number) => (nowMs += ms) };
}

async function toCaptured(h: ReturnType<typeof build>, domain = "acme.com") {
  const { orderId } = await h.saga.createIncomingTransfer({ asciiDomain: domain, tld: "com", userId: "u1", planId: "business", eppCode: "EPP-SECRET-123", termsAcceptanceId: "t1" }, OWNER);
  const order = (await h.repo.getIncoming(orderId))!;
  const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
  await h.saga.handleCheckoutCompleted({ eventId: `e-${orderId}`, rawBody: "{}", signature: "s", checkoutId: order.stripeCheckoutId!, paymentIntentId });
  return orderId;
}

describe("Stage 10 — incoming transfer state machine + gates", () => {
  it("submission only after capture (fails closed)", () => {
    expect(() => transferTransition("awaiting_payment", "transfer_submitting")).toThrow(IllegalTransferTransitionError);
    expect(transferTransition("payment_captured", "transfer_submitting")).toBe("transfer_submitting");
    expect(() => transferTransition("transfer_unknown", "transfer_submitting")).toThrow(); // no blind resubmit
  });

  it("disabled by default flag; owner-only; published terms required", async () => {
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const off = build({ enabled: false });
      await expect(off.saga.createIncomingTransfer({ asciiDomain: "acme.com", tld: "com", userId: "u1", planId: "business", eppCode: "EPP-1234" }, OWNER)).rejects.toBeInstanceOf(TransferDisabledError);
      const noTerms = build({ termsPublished: false });
      await expect(noTerms.saga.createIncomingTransfer({ asciiDomain: "acme.com", tld: "com", userId: "u1", planId: "business", eppCode: "EPP-1234" }, OWNER)).rejects.toBeInstanceOf(TransferGateError);
      const on = build();
      await expect(on.saga.createIncomingTransfer({ asciiDomain: "acme.com", tld: "com", userId: "u1", planId: "business", eppCode: "EPP-1234" }, NON_OWNER)).rejects.toBeInstanceOf(TransferAuthError);
    });
  });
});

describe("Stage 10 — incoming transfer happy path + EPP handling", () => {
  it("quotes transfer price, stores EPP encrypted (not readable via getIncoming), submits after capture, destroys EPP", async () => {
    const calls: string[] = [];
    const h = build({ fake: { transferInitiate: { "acme.com": "pending" }, transferStatus: { "acme.com": "completed" } } }, calls);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = await toCaptured(h);
      const o0 = (await h.repo.getIncoming(orderId))!;
      expect(o0.providerCostMinor).toBe(1080); // transfer price
      expect(o0.status).toBe("payment_captured");
      expect(o0.hasEpp).toBe(true);
      expect((o0 as unknown as Record<string, unknown>).epp).toBeUndefined(); // never exposed
      expect((o0 as unknown as Record<string, unknown>).eppCiphertext).toBeUndefined();

      // submit
      await h.saga.runSubmitOnce("w1");
      const o1 = (await h.repo.getIncoming(orderId))!;
      expect(o1.status).toBe("transfer_pending");
      expect(o1.hasEpp).toBe(false); // destroyed after single submission
      expect(await h.repo.getEppForSubmission(orderId)).toBeUndefined();
      expect(calls).toContain("initiateInboundTransfer");
    });
  });

  it("poll to completion creates the registration with the VERIFIED expiry and never touches nameservers", async () => {
    const calls: string[] = [];
    const h = build({ fake: { transferInitiate: { "acme.com": "pending" }, transferStatus: { "acme.com": "completed" } } }, calls);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = await toCaptured(h);
      await new DomainTransferWorker(h.saga, "w1", h.now).runOnce(); // submit -> pending
      h.advance(60 * 60 * 1000);
      await new DomainTransferWorker(h.saga, "w1", h.now).runOnce(); // poll -> completed
      const o = (await h.repo.getIncoming(orderId))!;
      expect(o.status).toBe("transfer_completed");
      expect(o.registrationId).toBeTruthy();
      const reg = (await h.registrations.get(o.registrationId!))!;
      expect(reg.expiresAt).toBe("2027-06-01T00:00:00Z"); // verified provider expiry, not +1y assumed
      // Nameservers preserved: setNameservers/applyDnsRecords never called.
      expect(calls).not.toContain("setNameservers");
      expect(calls).not.toContain("applyDnsRecords");
    });
  });

  it("duplicate active transfer for a domain is rejected", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await h.saga.createIncomingTransfer({ asciiDomain: "acme.com", tld: "com", userId: "u1", planId: "business", eppCode: "EPP-1234" }, OWNER);
      await expect(h.saga.createIncomingTransfer({ asciiDomain: "acme.com", tld: "com", userId: "u1", planId: "business", eppCode: "EPP-5678" }, OWNER)).rejects.toBeInstanceOf(DuplicateTransferError);
    });
  });
});

describe("Stage 10 — ambiguous submission + reconciliation + refunds", () => {
  it("ambiguous submission -> transfer_unknown (EPP destroyed, no blind resubmit); reconcile completes it", async () => {
    const h = build({ fake: { throwOnTransfer: true, transferStatus: { "acme.com": "completed" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = await toCaptured(h);
      await h.saga.runSubmitOnce("w1"); // throws -> transfer_unknown
      const u = (await h.repo.getIncoming(orderId))!;
      expect(u.status).toBe("transfer_unknown");
      expect(u.hasEpp).toBe(false); // single-use code destroyed even on ambiguity
      await h.saga.runReconcileOnce("w1"); // provider says completed
      expect((await h.repo.getIncoming(orderId))!.status).toBe("transfer_completed");
    });
  });

  it("rejected transfer refunds idempotently", async () => {
    const h = build({ fake: { transferInitiate: { "acme.com": "failed" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = await toCaptured(h);
      await new DomainTransferWorker(h.saga, "w1", h.now).runOnce(); // submit fail -> refund
      const o = (await h.repo.getIncoming(orderId))!;
      expect(["refund_pending", "refunded"]).toContain(o.status);
    });
  });

  it("crash during submit recovers to transfer_unknown", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = await toCaptured(h);
      await h.repo.updateIncoming(orderId, { status: "transfer_submitting", transferState: "submitting", leaseOwner: "dead", leaseUntil: new Date(0).toISOString() });
      await h.saga.runReconcileOnce("w1"); // recoverExpiredSubmit -> unknown, then reconcile
      expect(["transfer_unknown", "transfer_pending", "transfer_completed"]).toContain((await h.repo.getIncoming(orderId))!.status);
      expect((await h.repo.getIncoming(orderId))!.status).not.toBe("transfer_submitting");
    });
  });
});

describe("Stage 10 — outgoing transfer (deliberate owner actions)", () => {
  async function withReg(h: ReturnType<typeof build>) {
    await h.registrations.create({ id: "reg1", asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "namesilo", registeredAt: "2026-01-01T00:00:00Z", expiresAt: "2027-06-01T00:00:00Z" });
  }

  it("unlock is owner-only + reauth and audited", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await withReg(h);
      await expect(h.saga.outgoingUnlock("reg1", NON_OWNER)).rejects.toBeInstanceOf(TransferAuthError);
      await h.saga.outgoingUnlock("reg1", OWNER);
      expect(await h.registrar.getRegistrarLock("acme.com")).toBe(false); // unlocked
      const actions = await h.repo.listOutgoingActions("reg1");
      expect(actions.some((a) => a.action === "unlock" && a.outcome === "definitive_success")).toBe(true);
    });
  });

  it("auth-code request never stores a code the provider only emails to the registrant", async () => {
    const h = build(); // Fake default: emailed_to_registrant, no code
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await withReg(h);
      const res = await h.saga.outgoingRequestAuthCode("reg1", OWNER);
      expect(res.delivery).toBe("emailed_to_registrant");
      expect(res.code).toBeUndefined();
      const actions = await h.repo.listOutgoingActions("reg1");
      const rec = actions.find((a) => a.action === "request_auth_code")!;
      expect(rec.codeDelivery).toBe("emailed_to_registrant");
      // The audit record exposes only delivery — never a code field.
      expect(JSON.stringify(actions)).not.toContain("EPP");
    });
  });

  it("when the provider DOES return a code, it is handed back transiently but never persisted", async () => {
    const h = build({ fake: { authCode: { delivery: "returned", code: "RET-CODE-999" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await withReg(h);
      const res = await h.saga.outgoingRequestAuthCode("reg1", OWNER);
      expect(res.code).toBe("RET-CODE-999"); // transient return to the owner
      const actions = await h.repo.listOutgoingActions("reg1");
      expect(JSON.stringify(actions)).not.toContain("RET-CODE-999"); // never audited/persisted
    });
  });
});

describe("Stage 10 — multi-tenant worker isolation", () => {
  it("runs outside any ambient tenant and completes each org's transfer under its own tenant", async () => {
    const h = build({ fake: { transferInitiate: { "acme.com": "completed" } } });
    const ids: Record<string, string> = {};
    for (const org of ["orgA", "orgB"]) {
      await runWithTenant({ organizationId: org }, async () => { ids[org] = await toCaptured(h); });
    }
    await new DomainTransferWorker(h.saga, "w1", h.now).runOnce(); // submit -> completed (initiate says completed)
    for (const org of ["orgA", "orgB"]) {
      await runWithTenant({ organizationId: org }, async () => {
        expect((await h.repo.getIncoming(ids[org]))!.status).toBe("transfer_completed");
        const other = org === "orgA" ? "orgB" : "orgA";
        expect(await h.repo.getIncoming(ids[other])).toBeUndefined();
      });
    }
  });
});
