import { describe, expect, it } from "vitest";

import { redactSecrets } from "./namecheapXml";
import {
  NameSiloRegistrarProvider,
  type Fetcher,
  type NameSiloConfig,
} from "./NameSiloRegistrarProvider";
import type { RegistrarContact } from "./RegistrarContact";
import { RegistrarModeError } from "./RegistrarProvider";

const BASE: NameSiloConfig = {
  mode: "namesilo_sandbox",
  apiKey: "SECRETKEY",
  baseUrl: "https://ote.namesilo.com/api",
  purchasingEnabled: true,
  premiumPurchasingEnabled: false,
  incomingTransfersEnabled: false,
};

const contact: RegistrarContact = {
  firstName: "Test",
  lastName: "User",
  address1: "1 St",
  city: "Town",
  stateProvince: "CA",
  postalCode: "90001",
  country: "US",
  phone: "+1.5551234567",
  email: "t@example.com",
};

function reply(inner: string): string {
  return `<namesilo><request><operation>op</operation></request><reply><code>300</code><detail>success</detail>${inner}</reply></namesilo>`;
}

function router(map: Record<string, string>, seen?: string[]): Fetcher {
  return async (url: string) => {
    if (seen) seen.push(url);
    const op = /\/api\/([A-Za-z]+)\?version=1/.exec(url)?.[1] ?? "";
    return { ok: true, status: 200, text: async () => map[op] ?? reply("") };
  };
}

describe("NameSiloRegistrarProvider — reads", () => {
  it("parses availability incl. premium + unavailable", async () => {
    const p = new NameSiloRegistrarProvider(
      BASE,
      router({
        checkRegisterAvailability: reply(
          '<available><domain price="8.99" premium="0">free.com</domain>' +
            '<domain price="4200.00" premium="1">prem.com</domain></available>' +
            "<unavailable><domain>taken.com</domain></unavailable>",
        ),
      }),
    );
    const r = await p.checkAvailability(["free.com", "prem.com", "taken.com"]);
    expect(r.find((x) => x.domain === "free.com")).toMatchObject({ available: true, isPremium: false });
    const prem = r.find((x) => x.domain === "prem.com")!;
    expect(prem.isPremium).toBe(true);
    expect(prem.premiumRegisterPrice).toEqual({ amountMinor: 420000, currency: "USD" });
    expect(r.find((x) => x.domain === "taken.com")!.available).toBe(false);
  });

  it("parses register/renew/transfer/restore pricing from getPrices", async () => {
    const p = new NameSiloRegistrarProvider(
      BASE,
      router({
        getPrices: reply(
          "<com><registration>8.99</registration><transfer>8.99</transfer>" +
            "<renew>9.99</renew><restore>28.00</restore></com>",
        ),
      }),
    );
    expect((await p.getRegisterPrice("com", 1)).cost).toEqual({ amountMinor: 899, currency: "USD" });
    expect((await p.getRegisterPrice("com", 2)).cost.amountMinor).toBe(1798);
    expect((await p.getRenewPrice("com", 1)).cost.amountMinor).toBe(999);
    expect((await p.getTransferPrice("com", 1)).cost.amountMinor).toBe(899);
    expect((await p.getRestorePrice("com")).cost.amountMinor).toBe(2800);
  });

  it("reads domain info + balance", async () => {
    const p = new NameSiloRegistrarProvider(
      BASE,
      router({
        getDomainInfo: reply(
          "<expires>2027-01-01</expires><locked>Yes</locked><private>Yes</private>" +
            "<auto_renew>No</auto_renew><status>Active</status>" +
            '<nameservers><nameserver position="1">ns1.namesilo.com</nameserver></nameservers>',
        ),
        getAccountBalance: reply("<balance>150.00</balance>"),
      }),
    );
    const info = await p.getRegistrationStatus("a.com");
    expect(info).toMatchObject({ registered: true, locked: true, privacyEnabled: true, autoRenew: false });
    expect(info.nameservers).toEqual(["ns1.namesilo.com"]);
    expect(await p.getAccountBalance()).toEqual({ amountMinor: 15000, currency: "USD" });
  });

  it("never leaks the API key; redactSecrets strips it", async () => {
    const seen: string[] = [];
    const p = new NameSiloRegistrarProvider(BASE, router({}, seen));
    await p.getAccountBalance();
    expect(seen[0]).toContain("key=SECRETKEY");
    expect(redactSecrets(seen[0])).not.toContain("SECRETKEY");
  });

  it("Domain Defender: no security-question/answer parameter is ever sent", async () => {
    const seen: string[] = [];
    const p = new NameSiloRegistrarProvider(BASE, router({}, seen));
    await p.getRegistrationStatus("a.com");
    await p.getAccountBalance();
    for (const url of seen) {
      expect(url.toLowerCase()).not.toMatch(/security|answer|defender|question/);
    }
  });
});

describe("NameSiloRegistrarProvider — register outcomes", () => {
  const reg = (body: string, fetcher?: Fetcher) =>
    new NameSiloRegistrarProvider(
      BASE,
      fetcher ?? router({ registerDomain: body }),
    ).register({
      domain: "a.com",
      years: 1,
      contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
      enablePrivacy: true,
      idempotencyKey: "idem-1",
    });

  it("definitive_success on reply code 300", async () => {
    const r = await reg(reply("<order_id>555</order_id><order_amount>8.99</order_amount>"));
    expect(r.outcome).toBe("definitive_success");
    expect(r.registered).toBe(true);
    expect(r.correlation.orderId).toBe("555");
    expect(r.correlation.chargedMinor).toBe(899);
  });

  it("provider_rejection on a non-300 reply code", async () => {
    const r = await reg(
      "<namesilo><reply><code>261</code><detail>domain is not available</detail></reply></namesilo>",
    );
    expect(r.outcome).toBe("provider_rejection");
    expect(r.registered).toBe(false);
  });

  it("connection reset mid-flight -> ambiguous_unknown (never auto-retried)", async () => {
    const throwing: Fetcher = async () => {
      const e = new Error("reset") as Error & { code?: string };
      e.code = "ECONNRESET";
      throw e;
    };
    const r = await reg("", throwing);
    expect(r.outcome).toBe("ambiguous_unknown");
  });

  it("DNS/refused -> transport_failure_pre_acceptance", async () => {
    const throwing: Fetcher = async () => {
      const e = new Error("refused") as Error & { code?: string };
      e.code = "ECONNREFUSED";
      throw e;
    };
    expect((await reg("", throwing)).outcome).toBe("transport_failure_pre_acceptance");
  });
});

describe("NameSiloRegistrarProvider — mode + fail-closed flags + capabilities", () => {
  it("blocks live purchasing when DOMAIN_PURCHASING_ENABLED is false", async () => {
    const p = new NameSiloRegistrarProvider(
      { ...BASE, mode: "namesilo_live", purchasingEnabled: false },
      router({}),
    );
    await expect(
      p.register({
        domain: "a.com",
        years: 1,
        contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
        enablePrivacy: true,
        idempotencyKey: "x",
      }),
    ).rejects.toBeInstanceOf(RegistrarModeError);
  });

  it("blocks premium purchase + incoming transfers behind their own flags", async () => {
    const p = new NameSiloRegistrarProvider(BASE, router({}));
    await expect(
      p.register({
        domain: "prem.com",
        years: 1,
        contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
        enablePrivacy: true,
        premiumAcknowledged: true,
        acceptedPremiumMinor: 420000,
        idempotencyKey: "x",
      }),
    ).rejects.toBeInstanceOf(RegistrarModeError);
    await expect(
      p.initiateInboundTransfer("a.com", "EPP-SECRET", "x"),
    ).rejects.toBeInstanceOf(RegistrarModeError);
  });

  it("capability matrix is honest (autoRenew + dnssec supported, providerEvents unsupported)", () => {
    const caps = new NameSiloRegistrarProvider(BASE, router({})).capabilities();
    expect(caps.autoRenewControl.status).toBe("supported"); // unlike Namecheap
    expect(caps.dnssec.status).toBe("supported");
    expect(caps.restoration.status).toBe("limited");
    expect(caps.providerEvents.status).toBe("unsupported");
    expect(caps.eppAuthCode.note).toMatch(/email/i);
  });
});
