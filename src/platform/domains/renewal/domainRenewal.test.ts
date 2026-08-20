import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider, type FakeConfig } from "../FakeRegistrarProvider";
import { DEFAULT_PRICING_POLICY } from "../pricing/PricingPolicy";
import { FakeDomainStripeGateway } from "../saga/FakeDomainStripeGateway";
import { DomainRenewalRepository, DuplicateRenewalError } from "./DomainRenewalRepository";
import {
  AutoRenewNotAuthorized,
  DomainRenewalSaga,
} from "./DomainRenewalSaga";
import { DomainRenewalWorker } from "./DomainRenewalWorker";
import {
  IllegalRenewalTransitionError,
  renewalTransition,
} from "./renewalSagaState";

const OWNER = { role: "owner" as const, reauthenticatedRecently: true };
const EXP = "2027-01-01T00:00:00Z";

function build(fake: FakeConfig = {}, calls?: string[]) {
  const base = new FakeRegistrarProvider({
    priceByTld: { com: 1729 },
    expiresAtByDomain: { "acme.com": EXP },
    ...fake,
  });
  // Optional call recorder: delegates to the real instance (private fields
  // stay intact because methods are applied to the target, not the proxy).
  const registrar = calls
    ? new Proxy(base, {
        get(target, prop) {
          const value = (target as unknown as Record<string, unknown>)[prop as string];
          if (typeof value === "function") {
            return (...args: unknown[]) => {
              calls.push(String(prop));
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
          }
          return value;
        },
      })
    : base;
  const stripe = new FakeDomainStripeGateway();
  const registrations = new DomainRegistrationRepository();
  const repo = new DomainRenewalRepository();
  let seq = 0;
  let nowMs = Date.parse("2026-08-19T00:00:00Z");
  const now = () => new Date(nowMs).toISOString();
  const seen = new Set<string>();
  const saga = new DomainRenewalSaga({
    repo, stripe, registrar, registrations, policy: DEFAULT_PRICING_POLICY,
    now, newId: () => `id${++seq}`,
    successUrl: "https://x/s", cancelUrl: "https://x/c", maxRenewAttempts: 3, backoffMs: 1000,
    beginEvent: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
  });
  return { saga, repo, stripe, registrar, registrations, now, advance: (ms: number) => (nowMs += ms) };
}

async function confirmReg(h: ReturnType<typeof build>, id = "reg1", domain = "acme.com") {
  await h.registrations.create({
    id, orderId: "o1", asciiDomain: domain, unicodeDomain: domain, tld: "com",
    provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: EXP,
  });
  return id;
}

async function toRenewalQueued(h: ReturnType<typeof build>) {
  const { orderId } = await h.saga.createManualRenewal({ registrationId: "reg1", userId: "u1", planId: "business", termYears: 1, termsAcceptanceId: "t1" });
  const order = (await h.repo.getOrder(orderId))!;
  const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
  await h.saga.handleCheckoutCompleted({ eventId: "e1", rawBody: "{}", signature: "s", checkoutId: order.stripeCheckoutId!, paymentIntentId });
  return orderId;
}

describe("Stage 9 — renewal state machine", () => {
  it("renewal is only reachable after capture (fails closed)", () => {
    expect(() => renewalTransition("payment_captured", "renewing")).toThrow(IllegalRenewalTransitionError);
    expect(renewalTransition("payment_captured", "renewal_queued")).toBe("renewal_queued");
    expect(renewalTransition("renewal_queued", "renewing")).toBe("renewing");
  });
  it("ambiguous has no auto-retry-to-renewed and no direct refund jump", () => {
    expect(renewalTransition("renewal_unknown", "renewed")).toBe("renewed");
    expect(renewalTransition("renewal_unknown", "refund_queued")).toBe("refund_queued");
    expect(() => renewalTransition("refund_queued", "refunded")).toThrow(); // must go via pending
  });
});

describe("Stage 9 — manual renewal (customer checkout)", () => {
  it("quotes the RENEWAL price (not registration) and binds the cycle", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const { orderId } = await h.saga.createManualRenewal({ registrationId: "reg1", userId: "u1", planId: "business", termYears: 1, termsAcceptanceId: "t1" });
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.mode).toBe("manual");
      expect(o.chargePath).toBe("checkout");
      expect(o.providerCostMinor).toBe(1729); // getRenewPrice
      expect(o.customerPriceMinor).toBe(1729 + 346); // business markup: max(20%,300)=346
      expect(o.currentExpiresAt).toBe(EXP);
      expect(o.pricingVersion).toBe(DEFAULT_PRICING_POLICY.version);
      expect(o.status).toBe("awaiting_payment");
    });
  });

  it("captures then renews exactly once and refreshes the provider expiry", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const orderId = await toRenewalQueued(h);
      expect((await h.repo.getOrder(orderId))!.status).toBe("renewal_queued");
      const worker = new DomainRenewalWorker(h.saga, "w1", h.now);
      await worker.runOnce();
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("renewed");
      expect(Date.parse(o.newExpiresAt!)).toBe(Date.parse("2028-01-01T00:00:00Z")); // advanced 1y
      expect(Date.parse((await h.registrations.get("reg1"))!.expiresAt!)).toBe(Date.parse("2028-01-01T00:00:00Z"));
      expect(h.repo.listAttempts()).toContainEqual({ operation: "renew", outcome: "definitive_success" });
    });
  });

  it("prevents a duplicate renewal for the same registration + cycle + term", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await h.saga.createManualRenewal({ registrationId: "reg1", userId: "u1", planId: "business", termYears: 1 });
      await expect(
        h.saga.createManualRenewal({ registrationId: "reg1", userId: "u1", planId: "business", termYears: 1 }),
      ).rejects.toBeInstanceOf(DuplicateRenewalError);
    });
  });

  it("definitive provider failure refunds idempotently", async () => {
    const h = build({ renewResult: { "acme.com": { outcome: "definitive_failure", registered: false, correlation: {}, errorCategory: "tld_error" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const orderId = await toRenewalQueued(h);
      const worker = new DomainRenewalWorker(h.saga, "w1", () => "2026-08-19T00:00:00Z");
      await worker.runOnce(); // renew fails -> refund queued -> refund processed
      const o = (await h.repo.getOrder(orderId))!;
      expect(["refund_pending", "refunded"]).toContain(o.status);
      expect((await h.registrations.get("reg1"))!.expiresAt).toBe(EXP); // NOT advanced
    });
  });
});

describe("Stage 9 — ambiguous outcome + read-only reconciliation", () => {
  async function toUnknown(fake: FakeConfig = {}) {
    const h = build({ renewResult: { "acme.com": { outcome: "ambiguous_unknown", registered: false, correlation: {}, errorCategory: "timeout" } }, ...fake });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      const orderId = await toRenewalQueued(h);
      await h.saga.runRenewalOnce("w1"); // -> renewal_unknown
      expect((await h.repo.getOrder(orderId))!.status).toBe("renewal_unknown");
      (h as unknown as { _orderId: string })._orderId = orderId;
    });
    return h;
  }

  it("reconcile proving the renewal happened completes it (no new mutation)", async () => {
    const h = await toUnknown();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = (h as unknown as { _orderId: string })._orderId;
      // The provider actually advanced the expiry despite the ambiguous reply.
      h.registrar.setExpiry("acme.com", "2028-01-01T00:00:00Z");
      await h.saga.runRenewalReconcileOnce("w1");
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.status).toBe("renewed");
      expect((await h.registrations.get("reg1"))!.expiresAt).toBe("2028-01-01T00:00:00Z");
    });
  });

  it("reconcile proving NO renewal queues a refund (expiry unchanged)", async () => {
    const h = await toUnknown();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = (h as unknown as { _orderId: string })._orderId;
      await h.saga.runRenewalReconcileOnce("w1"); // expiry still EXP -> not renewed
      const o = (await h.repo.getOrder(orderId))!;
      expect(["refund_queued", "refund_pending", "refunded"]).toContain(o.status);
    });
  });

  it("provider timeout during reconcile reschedules then escalates, never fabricated", async () => {
    const h = await toUnknown({ throwOnStatus: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const orderId = (h as unknown as { _orderId: string })._orderId;
      for (let i = 0; i < 5; i++) {
        h.advance(60 * 60 * 1000); // past any backoff
        await h.saga.runRenewalReconcileOnce("w1");
      }
      expect((await h.repo.getOrder(orderId))!.status).toBe("needs_attention");
    });
  });
});

describe("Stage 9 — automatic renewal (opt-in, off by default, customer-funded)", () => {
  it("auto-renew is OFF by default and requires an eligible saved method", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      expect(await h.repo.getAutoRenew("reg1")).toBeUndefined(); // off by default
      await expect(h.saga.createAutoRenewal("reg1")).rejects.toBeInstanceOf(AutoRenewNotAuthorized);
      await expect(
        h.saga.enableAutoRenew("reg1", { userId: "u1", termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "", stripePaymentMethodRef: "", currency: "USD" }, OWNER),
      ).rejects.toBeInstanceOf(AutoRenewNotAuthorized);
    });
  });

  it("enabled auto-renew charges off-session then renews via the worker", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await h.saga.enableAutoRenew("reg1", { userId: "u1", termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "cus_1", stripePaymentMethodRef: "pm_1", currency: "USD" }, OWNER);
      const { orderId, status } = await h.saga.createAutoRenewal("reg1");
      expect(status).toBe("renewal_queued");
      const o0 = (await h.repo.getOrder(orderId))!;
      expect(o0.mode).toBe("auto");
      expect(o0.chargePath).toBe("off_session");
      expect(o0.paymentState).toBe("captured");
      await new DomainRenewalWorker(h.saga, "w1", () => "2026-08-19T00:00:00Z").runOnce();
      expect((await h.repo.getOrder(orderId))!.status).toBe("renewed");
    });
  });

  it("declined off-session charge never captures or renews (All Elite funds do not renew)", async () => {
    const h = build();
    h.stripe.setOffSessionResult("failed");
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await h.saga.enableAutoRenew("reg1", { userId: "u1", termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "cus_1", stripePaymentMethodRef: "pm_1", currency: "USD" }, OWNER);
      const { orderId, status } = await h.saga.createAutoRenewal("reg1");
      expect(status).toBe("needs_attention");
      const o = (await h.repo.getOrder(orderId))!;
      expect(o.paymentState).not.toBe("captured");
      expect(o.renewalState).toBe("none");
    });
  });

  it("disabling auto-renew only flips the flag — never cancels/deletes the domain", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await h.saga.enableAutoRenew("reg1", { userId: "u1", termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "cus_1", stripePaymentMethodRef: "pm_1", currency: "USD" }, OWNER);
      await h.saga.disableAutoRenew("reg1", "u1");
      const auth = (await h.repo.getAutoRenew("reg1"))!;
      expect(auth.enabled).toBe(false);
      expect(auth.stripePaymentMethodRef).toBeUndefined(); // no future off-session charge
      const reg = (await h.registrations.get("reg1"))!;
      expect(reg.status).toBe("active"); // domain untouched
      expect(reg.expiresAt).toBe(EXP);
    });
  });
});

describe("Stage 9 — registrar-balance auto-renew stays OFF; capture gates renewal", () => {
  it("automatic renewal uses one-time provider renew() after off-session capture — never a registrar auto-renew toggle", async () => {
    const calls: string[] = [];
    const h = build({}, calls);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await h.saga.enableAutoRenew("reg1", { userId: "u1", termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "cus_1", stripePaymentMethodRef: "pm_1", currency: "USD" }, OWNER);
      await h.saga.createAutoRenewal("reg1"); // fresh recheck + off-session charge
      await new DomainRenewalWorker(h.saga, "w1", h.now).runOnce();
      // Fresh RENEWAL price rechecked before charging (renewal price, not reg):
      expect(calls).toContain("getRenewPrice");
      // Exactly ONE one-time renewal submission:
      expect(calls.filter((c) => c === "renew").length).toBe(1);
      // NEVER a registrar-side auto-renew enable (no such call in the flow, and
      // the provider interface exposes no auto-renew toggle to this saga):
      expect(calls.some((c) => /autoRenew|addAutoRenewal|removeAutoRenewal/i.test(c))).toBe(false);
    });
  });

  it("without a confirmed capture (declined off-session), provider renew() is NEVER called", async () => {
    const calls: string[] = [];
    const h = build({}, calls);
    h.stripe.setOffSessionResult("failed");
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await confirmReg(h);
      await h.saga.enableAutoRenew("reg1", { userId: "u1", termsAcceptanceId: "t1", pricingVersionAck: 1, stripeCustomerRef: "cus_1", stripePaymentMethodRef: "pm_1", currency: "USD" }, OWNER);
      await h.saga.createAutoRenewal("reg1"); // charge declined -> needs_attention
      await new DomainRenewalWorker(h.saga, "w1", h.now).runOnce();
      expect(calls.filter((c) => c === "renew").length).toBe(0); // All Elite funds never renew
    });
  });
});

describe("Stage 9 — multi-tenant worker isolation", () => {
  it("runs outside any ambient tenant and renews each org's order under its own tenant", async () => {
    const h = build();
    // capture a renewal in orgA and orgB
    const ids: Record<string, string> = {};
    for (const org of ["orgA", "orgB"]) {
      await runWithTenant({ organizationId: org }, async () => {
        await h.registrations.create({ id: `reg-${org}`, asciiDomain: "acme.com", unicodeDomain: "acme.com", tld: "com", provider: "fake", registeredAt: "2026-01-01T00:00:00Z", expiresAt: EXP });
        const { orderId } = await h.saga.createManualRenewal({ registrationId: `reg-${org}`, userId: "u1", planId: "business", termYears: 1 });
        const order = (await h.repo.getOrder(orderId))!;
        const { paymentIntentId } = h.stripe.markPaid(order.stripeCheckoutId!);
        await h.saga.handleCheckoutCompleted({ eventId: `e-${org}`, rawBody: "{}", signature: "s", checkoutId: order.stripeCheckoutId!, paymentIntentId });
        ids[org] = orderId;
      });
    }
    // Worker with NO ambient tenant.
    await new DomainRenewalWorker(h.saga, "w1", () => "2026-08-19T00:00:00Z").runOnce();
    for (const org of ["orgA", "orgB"]) {
      await runWithTenant({ organizationId: org }, async () => {
        expect((await h.repo.getOrder(ids[org]))!.status).toBe("renewed");
        const other = org === "orgA" ? "orgB" : "orgA";
        expect(await h.repo.getOrder(ids[other])).toBeUndefined(); // isolation
      });
    }
  });
});
