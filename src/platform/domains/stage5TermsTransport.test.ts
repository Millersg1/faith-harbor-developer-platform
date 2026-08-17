import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import {
  DomainTermsAcceptanceRepository,
  DomainTermsService,
  TermsNotPublishedError,
} from "./DomainTermsService";
import { domainNoticeCatalog } from "./notices/domainNotices";
import {
  createHardenedFetcher,
  RegistrarTransportError,
} from "./transport/hardenedFetch";
import { createRegistrarProvider } from "./registrarFactory";
import { NameSiloRegistrarProvider } from "./NameSiloRegistrarProvider";
import { NamecheapRegistrarProvider } from "./NamecheapRegistrarProvider";

function termsDeps(published: number | null) {
  return {
    repo: new DomainTermsAcceptanceRepository(),
    publishedTermsVersion: () => published,
    newId: (() => {
      let n = 0;
      return () => `a${++n}`;
    })(),
    now: () => "2026-01-01T00:00:00Z",
    registrarAgreementRef: "namesilo-registration-agreement",
    registrarAgreementFingerprint: "sha256:pending",
  };
}

const acceptance = {
  userId: "u1",
  quoteId: "q1",
  asciiDomain: "acme.com",
  operation: "register",
  years: 1,
  pricingVersion: 1,
  finalPriceMinor: 2099,
  currency: "USD",
  autoRenewChoice: false,
  premiumAcknowledged: false,
  source: "checkout",
  ip: "203.0.113.5",
};

describe("DomainTermsService — fails closed while unpublished", () => {
  it("cannot record acceptance when no terms version is published", async () => {
    const svc = new DomainTermsService(termsDeps(null));
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(svc.recordAcceptance(acceptance)).rejects.toBeInstanceOf(
        TermsNotPublishedError,
      );
      expect(await svc.needsReconsent("u1")).toBe(true);
    });
  });

  it("records immutable evidence when published, with only the allowed fields", async () => {
    const svc = new DomainTermsService(termsDeps(1));
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const row = await svc.recordAcceptance(acceptance);
      expect(row.aecTermsVersion).toBe(1);
      expect(row.finalPriceMinor).toBe(2099);
      // no contact PII / no payment data fields present
      const keys = Object.keys(row);
      expect(keys).not.toContain("email");
      expect(keys).not.toContain("cardNumber");
      expect(keys).not.toContain("apiKey");
      expect(await svc.needsReconsent("u1")).toBe(false);
    });
  });

  it("requires re-consent after a materially newer published version", async () => {
    const deps = termsDeps(1);
    const svc = new DomainTermsService(deps);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await svc.recordAcceptance(acceptance); // accepts v1
      expect(await svc.needsReconsent("u1")).toBe(false);
    });
    // Publish v2 -> prior acceptance is stale for FUTURE purchases.
    const deps2 = { ...deps, publishedTermsVersion: () => 2 };
    const svc2 = new DomainTermsService(deps2);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect(await svc2.needsReconsent("u1")).toBe(true);
    });
  });
});

describe("hardenedFetch — GET-query transport safety", () => {
  const allowed = { allowedHosts: ["www.namesilo.com"] };

  it("refuses a non-allowlisted host (fail closed)", async () => {
    const f = createHardenedFetcher(allowed, async () => ({ ok: true, status: 200, text: async () => "" }));
    await expect(f("https://evil.example/api?key=x")).rejects.toBeInstanceOf(RegistrarTransportError);
  });

  it("refuses an insecure scheme", async () => {
    const f = createHardenedFetcher(allowed, async () => ({ ok: true, status: 200, text: async () => "" }));
    await expect(f("http://www.namesilo.com/api?key=x")).rejects.toBeInstanceOf(RegistrarTransportError);
  });

  it("passes redirect:'error' to the underlying fetch (refuses redirects)", async () => {
    let seenInit: { redirect: string } | undefined;
    const f = createHardenedFetcher(allowed, async (_u, init) => {
      seenInit = init;
      return { ok: true, status: 200, text: async () => "ok" };
    });
    await f("https://www.namesilo.com/api/getPrices?version=1&key=SECRET");
    expect(seenInit?.redirect).toBe("error");
  });

  it("NEVER leaks the URL/key when the underlying error contains the full request URL", async () => {
    const f = createHardenedFetcher(allowed, async () => {
      throw new Error(
        "connect failed to https://www.namesilo.com/api/getPrices?version=1&key=SUPERSECRETKEY",
      );
    });
    try {
      await f("https://www.namesilo.com/api/getPrices?version=1&key=SUPERSECRETKEY");
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(e).toBeInstanceOf(RegistrarTransportError);
      expect(msg).not.toContain("SUPERSECRETKEY");
      expect(msg).not.toContain("namesilo.com");
    }
  });
});

describe("provider separation", () => {
  it("NameSilo and Namecheap are distinct, independently constructed providers", () => {
    const ns = createRegistrarProvider({
      DOMAIN_REGISTRAR_MODE: "namesilo_sandbox",
      NAMESILO_SANDBOX_API_KEY: "k",
    });
    const nc = createRegistrarProvider({
      DOMAIN_REGISTRAR_MODE: "namecheap_sandbox",
      NAMECHEAP_SANDBOX_API_USER: "u",
      NAMECHEAP_SANDBOX_USERNAME: "u",
      NAMECHEAP_SANDBOX_API_KEY: "k",
      NAMECHEAP_SANDBOX_CLIENT_IP: "1.2.3.4",
    });
    expect(ns).toBeInstanceOf(NameSiloRegistrarProvider);
    expect(nc).toBeInstanceOf(NamecheapRegistrarProvider);
    expect(ns.providerId).toBe("namesilo");
    expect(nc.providerId).toBe("namecheap");
  });
});

describe("domain notices — transactional design only", () => {
  it("catalogs all required notices as transactional", () => {
    const cat = domainNoticeCatalog();
    expect(cat.length).toBe(13);
    expect(cat.every((n) => n.messageClass === "transactional")).toBe(true);
  });
});
