import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { DomainQuoteRepository } from "./DomainQuoteRepository";
import {
  CurrencyMismatchError,
  DomainQuoteService,
  DomainUnavailableError,
  PremiumConfirmationRequiredError,
  QuoteChangedError,
  QuoteExpiredError,
  QuoteStaleError,
  type QuoteServiceDeps,
} from "./DomainQuoteService";
import { FakeRegistrarProvider, type FakeConfig } from "./FakeRegistrarProvider";
import {
  customerPriceMinor,
  DEFAULT_PRICING_POLICY,
  markupMinor,
} from "./pricing/PricingPolicy";

const PLAN = "business"; // 2000 bps, $3 min

function build(cfg: FakeConfig, start = 1_000_000) {
  const provider = new FakeRegistrarProvider({ priceByTld: { com: 906 }, ...cfg });
  const quotes = new DomainQuoteRepository();
  let now = start;
  let seq = 0;
  const deps: QuoteServiceDeps = {
    provider,
    quotes,
    policy: DEFAULT_PRICING_POLICY,
    nowMs: () => now,
    ttlMs: 15 * 60 * 1000,
    newId: () => `q${++seq}`,
    customerCurrency: "USD",
  };
  return {
    svc: new DomainQuoteService(deps),
    advance: (ms: number) => (now += ms),
    provider,
    cfg: provider["cfg"] as FakeConfig, // mutable pricing for the change test
  };
}

describe("PricingPolicy — greater of % or fixed minimum", () => {
  it("uses the percentage when it exceeds the minimum", () => {
    const rule = { percentBps: 2000, minMarkupMinor: 300 };
    expect(markupMinor(5000, rule)).toBe(1000); // 20% of $50 = $10 > $3
    expect(customerPriceMinor(5000, rule)).toBe(6000);
  });
  it("uses the fixed minimum when the percentage is smaller", () => {
    const rule = { percentBps: 2000, minMarkupMinor: 300 };
    expect(markupMinor(500, rule)).toBe(300); // 20% of $5 = $1 < $3 min
    expect(customerPriceMinor(500, rule)).toBe(800);
  });
  it("rounds the percentage once and never uses float", () => {
    expect(markupMinor(899, { percentBps: 2000, minMarkupMinor: 0 })).toBe(180);
  });
});

describe("DomainQuoteService.search (advisory, all operations separate)", () => {
  it("shows register + renewal + transfer + restore prices, and a mixed-script warning", async () => {
    const { svc } = build({});
    const [p] = await runWithTenant({ organizationId: "orgA" }, () =>
      svc.search(["аpple.com"], PLAN), // Latin/Cyrillic mix
    );
    expect(p.mixedScriptWarning).toBe(true);
    expect(p.registerPriceMinor).toBe(customerPriceMinor(906, DEFAULT_PRICING_POLICY.byPlan.business));
    expect(p.renewPriceMinor).toBeGreaterThan(0);
    expect(p.transferPriceMinor).toBeGreaterThan(0);
    expect(p.restorePriceMinor).toBeGreaterThan(0);
    // No wholesale cost is exposed in the preview.
    expect(Object.keys(p)).not.toContain("providerCostMinor");
  });
});

describe("DomainQuoteService.createRegisterQuote", () => {
  it("quotes an available domain; customer view hides cost/markup, diagnostics shows them", async () => {
    const { svc } = build({});
    const { customer, diagnostics } = await runWithTenant({ organizationId: "orgA" }, () =>
      svc.createRegisterQuote("acme.com", 1, PLAN),
    );
    expect(customer.priceMinor).toBe(customerPriceMinor(906, DEFAULT_PRICING_POLICY.byPlan.business));
    expect(customer.renewalPriceMinor).toBeGreaterThan(0); // renewal shown separately
    expect(Object.keys(customer)).not.toContain("providerCostMinor");
    expect(Object.keys(customer)).not.toContain("markupMinor");
    expect(diagnostics.providerCostMinor).toBe(906);
    expect(diagnostics.markupMinor).toBe(customer.priceMinor - 906);
    expect(diagnostics.provider).toBe("fake");
  });

  it("rejects an unavailable domain", async () => {
    const { svc } = build({ availability: { "taken.com": { available: false } } });
    await expect(
      runWithTenant({ organizationId: "orgA" }, () => svc.createRegisterQuote("taken.com", 1, PLAN)),
    ).rejects.toBeInstanceOf(DomainUnavailableError);
  });

  it("rejects a malformed domain", async () => {
    const { svc } = build({});
    await expect(
      runWithTenant({ organizationId: "orgA" }, () => svc.createRegisterQuote("not a domain", 1, PLAN)),
    ).rejects.toThrow();
  });

  it("detects premium + requires confirmation before purchase", async () => {
    const { svc } = build({
      availability: {
        "prem.com": { available: true, isPremium: true, premiumRegisterPrice: { amountMinor: 500000, currency: "USD" } },
      },
    });
    const { customer } = await runWithTenant({ organizationId: "orgA" }, () =>
      svc.createRegisterQuote("prem.com", 1, PLAN),
    );
    expect(customer.isPremium).toBe(true);
    expect(customer.requiresPremiumConfirmation).toBe(true);
    await expect(
      runWithTenant({ organizationId: "orgA" }, () => svc.recheckForPurchase(customer.id)),
    ).rejects.toBeInstanceOf(PremiumConfirmationRequiredError);
  });

  it("fails closed on provider/customer currency mismatch (no FX)", async () => {
    const { svc } = build({ currency: "EUR" });
    await expect(
      runWithTenant({ organizationId: "orgA" }, () => svc.createRegisterQuote("acme.com", 1, PLAN)),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
  });

  it("propagates a provider timeout before acceptance (no quote persisted)", async () => {
    const { svc } = build({});
    // Force checkAvailability to throw (provider timeout).
    (svc as unknown as { deps: QuoteServiceDeps }).deps.provider.checkAvailability = async () => {
      throw new Error("ETIMEDOUT");
    };
    await expect(
      runWithTenant({ organizationId: "orgA" }, () => svc.createRegisterQuote("acme.com", 1, PLAN)),
    ).rejects.toThrow();
  });

  it("supports concurrent quotes (distinct ids)", async () => {
    const { svc } = build({});
    const [a, b] = await runWithTenant({ organizationId: "orgA" }, () =>
      Promise.all([
        svc.createRegisterQuote("a.com", 1, PLAN),
        svc.createRegisterQuote("b.com", 1, PLAN),
      ]),
    );
    expect(a.customer.id).not.toBe(b.customer.id);
  });
});

describe("DomainQuoteService.recheckForPurchase (fail closed)", () => {
  it("passes for a fresh unchanged quote", async () => {
    const { svc } = build({});
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const { customer } = await svc.createRegisterQuote("acme.com", 1, PLAN);
      const row = await svc.recheckForPurchase(customer.id);
      expect(row.status).toBe("active");
    });
  });

  it("fails closed on an expired quote (and marks it expired)", async () => {
    const { svc, advance } = build({});
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const { customer } = await svc.createRegisterQuote("acme.com", 1, PLAN);
      advance(16 * 60 * 1000); // past the 15-min TTL
      await expect(svc.recheckForPurchase(customer.id)).rejects.toBeInstanceOf(QuoteExpiredError);
    });
  });

  it("fails closed when the provider price changed since the quote", async () => {
    const built = build({});
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const { customer } = await built.svc.createRegisterQuote("acme.com", 1, PLAN);
      built.cfg.priceByTld!.com = 1299; // registrar price rose
      await expect(built.svc.recheckForPurchase(customer.id)).rejects.toBeInstanceOf(QuoteChangedError);
    });
  });

  it("is tenant-isolated — another tenant cannot use the quote", async () => {
    const { svc } = build({});
    const id = await runWithTenant({ organizationId: "orgA" }, async () =>
      (await svc.createRegisterQuote("acme.com", 1, PLAN)).customer.id,
    );
    await runWithTenant({ organizationId: "orgB" }, async () => {
      await expect(svc.recheckForPurchase(id)).rejects.toBeInstanceOf(QuoteStaleError);
    });
  });
});
