import { describe, expect, it } from "vitest";

import type { RegistrarContact } from "./RegistrarContact";
import {
  NamecheapRegistrarProvider,
  type Fetcher,
  type NamecheapConfig,
} from "./NamecheapRegistrarProvider";
import { redactSecrets } from "./namecheapXml";
import { RegistrarModeError } from "./RegistrarProvider";

const BASE: NamecheapConfig = {
  mode: "namecheap_sandbox",
  apiUser: "u",
  apiKey: "k",
  userName: "u",
  clientIp: "1.2.3.4",
  baseUrl: "https://api.sandbox.namecheap.com/xml.response",
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

function ok(inner: string): string {
  return `<ApiResponse Status="OK"><CommandResponse>${inner}</CommandResponse></ApiResponse>`;
}

/** Fetcher that dispatches canned bodies by Command in the URL. */
function router(map: Record<string, string>, capture?: string[]): Fetcher {
  return async (url: string) => {
    if (capture) capture.push(url);
    const cmd = /Command=([^&]+)/.exec(url)?.[1] ?? "";
    const body = map[cmd] ?? ok("");
    return { ok: true, status: 200, text: async () => body };
  };
}

describe("NamecheapRegistrarProvider — reads", () => {
  it("parses availability incl. premium price in minor units", async () => {
    const p = new NamecheapRegistrarProvider(
      BASE,
      router({
        "namecheap.domains.check": ok(
          '<DomainCheckResult Domain="a.com" Available="true" IsPremiumName="false"/>' +
            '<DomainCheckResult Domain="b.com" Available="true" IsPremiumName="true" PremiumRegistrationPrice="4200.00" PremiumRenewalPrice="4200.00"/>',
        ),
      }),
    );
    const r = await p.checkAvailability(["a.com", "b.com"]);
    expect(r[0]).toMatchObject({ domain: "a.com", available: true, isPremium: false });
    expect(r[1].isPremium).toBe(true);
    expect(r[1].premiumRegisterPrice).toEqual({ amountMinor: 420000, currency: "USD" });
  });

  it("parses register pricing for the requested term", async () => {
    const p = new NamecheapRegistrarProvider(
      BASE,
      router({
        "namecheap.users.getPricing": ok(
          '<Product Name="com">' +
            '<Price Duration="1" DurationType="YEAR" Price="10.98" YourPrice="9.06"/>' +
            '<Price Duration="2" DurationType="YEAR" Price="21.96" YourPrice="18.12"/>' +
            "</Product>",
        ),
      }),
    );
    expect((await p.getRegisterPrice("com", 1)).cost).toEqual({ amountMinor: 906, currency: "USD" });
    expect((await p.getRegisterPrice("com", 2)).cost.amountMinor).toBe(1812);
  });

  it("reads registrar lock + balance", async () => {
    const p = new NamecheapRegistrarProvider(
      BASE,
      router({
        "namecheap.domains.getRegistrarLock": ok(
          '<DomainGetRegistrarLockResult Domain="a.com" RegistrarLockStatus="true"/>',
        ),
        "namecheap.users.getBalances": ok(
          '<UserGetBalancesResult Currency="USD" AvailableBalance="150.00"/>',
        ),
      }),
    );
    expect(await p.getRegistrarLock("a.com")).toBe(true);
    expect(await p.getAccountBalance()).toEqual({ status: "available", amountMinor: 15000, currency: "USD" });
  });

  it("balance fails closed to currency_unknown when the response carries no Currency", async () => {
    const p = new NamecheapRegistrarProvider(
      BASE,
      router({ "namecheap.users.getBalances": ok('<UserGetBalancesResult AvailableBalance="150.00"/>') }),
    );
    expect(await p.getAccountBalance()).toEqual({ status: "unavailable", reason: "currency_unknown" });
  });

  it("balance fails closed to unavailable when the result element is missing", async () => {
    const p = new NamecheapRegistrarProvider(
      BASE,
      router({ "namecheap.users.getBalances": ok("<Other/>") }),
    );
    expect(await p.getAccountBalance()).toEqual({ status: "unavailable", reason: "missing_balance_element" });
  });

  it("redacts credentials from the URL it would log (never leaks ApiKey)", () => {
    const seen: string[] = [];
    const p = new NamecheapRegistrarProvider(BASE, router({}, seen));
    // Exercise a call so a URL is generated.
    return p.checkAvailability(["a.com"]).then(() => {
      // The raw URL contains the key (that's the wire), but our redactor must
      // strip it — simulate what any logger must do.
      expect(seen[0]).toContain("ApiKey=k");
      expect(redactSecrets(seen[0])).not.toContain("ApiKey=k");
    });
  });
});

describe("NamecheapRegistrarProvider — register outcome classification", () => {
  const reg = (body: string, fetcher?: Fetcher) =>
    new NamecheapRegistrarProvider(
      BASE,
      fetcher ?? router({ "namecheap.domains.create": body }),
    ).register({
      domain: "a.com",
      years: 1,
      contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
      enablePrivacy: true,
      idempotencyKey: "idem-1",
    });

  it("definitive_success on Registered=true", async () => {
    const r = await reg(
      ok('<DomainCreateResult Domain="a.com" Registered="true" ChargedAmount="9.06" OrderID="o1" TransactionID="t1" DomainID="d1"/>'),
    );
    expect(r.outcome).toBe("definitive_success");
    expect(r.registered).toBe(true);
    expect(r.correlation).toMatchObject({ orderId: "o1", transactionId: "t1", chargedMinor: 906 });
  });

  it("definitive_failure on Registered=false (real-time)", async () => {
    const r = await reg(
      ok('<DomainCreateResult Domain="a.com" Registered="false" NonRealTimeDomain="false"/>'),
    );
    expect(r.outcome).toBe("definitive_failure");
    expect(r.registered).toBe(false);
  });

  it("ambiguous_unknown on a non-real-time create", async () => {
    const r = await reg(
      ok('<DomainCreateResult Domain="a.com" Registered="false" NonRealTimeDomain="true" OrderID="o9"/>'),
    );
    expect(r.outcome).toBe("ambiguous_unknown");
    expect(r.errorCategory).toBe("non_realtime_pending");
  });

  it("provider_rejection on an API error envelope", async () => {
    const r = await reg(
      '<ApiResponse Status="ERROR"><Errors><Error Number="2033409">Possibly a duplicate</Error></Errors></ApiResponse>',
    );
    expect(r.outcome).toBe("provider_rejection");
  });

  it("classifies a connection reset mid-flight as ambiguous_unknown (never auto-retried)", async () => {
    const throwing: Fetcher = async () => {
      const e = new Error("reset") as Error & { code?: string };
      e.code = "ECONNRESET";
      throw e;
    };
    const r = await reg("", throwing);
    expect(r.outcome).toBe("ambiguous_unknown");
    expect(r.registered).toBe(false);
  });

  it("classifies DNS/refused as transport_failure_pre_acceptance", async () => {
    const throwing: Fetcher = async () => {
      const e = new Error("refused") as Error & { code?: string };
      e.code = "ECONNREFUSED";
      throw e;
    };
    const r = await reg("", throwing);
    expect(r.outcome).toBe("transport_failure_pre_acceptance");
  });

  it("returns ambiguous_unknown on an unparsable 200 body", async () => {
    const r = await reg(ok("<Nonsense/>"));
    expect(r.outcome).toBe("ambiguous_unknown");
    expect(r.errorCategory).toBe("unparsable_create_result");
  });
});

describe("NamecheapRegistrarProvider — mode + fail-closed flags", () => {
  it("blocks live purchasing when DOMAIN_PURCHASING_ENABLED is false", async () => {
    const p = new NamecheapRegistrarProvider(
      { ...BASE, mode: "namecheap_live", purchasingEnabled: false },
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

  it("blocks premium purchase behind its own flag (even in sandbox)", async () => {
    const p = new NamecheapRegistrarProvider(BASE, router({}));
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
  });

  it("blocks incoming transfers behind its own flag", async () => {
    const p = new NamecheapRegistrarProvider(BASE, router({}));
    await expect(
      p.initiateInboundTransfer("a.com", "EPP-SECRET", "x"),
    ).rejects.toBeInstanceOf(RegistrarModeError);
  });

  it("capability matrix is honest (autoRenew limited, providerEvents unsupported)", () => {
    const caps = new NamecheapRegistrarProvider(BASE, router({})).capabilities();
    expect(caps.autoRenewControl.status).toBe("limited");
    expect(caps.providerEvents.status).toBe("unsupported");
    expect(caps.availability.status).toBe("supported");
    expect(caps.dnssec.status).toBe("unknown");
  });
});
