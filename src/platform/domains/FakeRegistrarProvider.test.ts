import { describe, expect, it } from "vitest";

import { FakeRegistrarProvider } from "./FakeRegistrarProvider";

describe("FakeRegistrarProvider (deterministic offline)", () => {
  it("scripts availability + pricing", async () => {
    const p = new FakeRegistrarProvider({
      availability: { "taken.com": { available: false } },
      priceByTld: { com: 906 },
    });
    const a = await p.checkAvailability(["free.com", "taken.com"]);
    expect(a[0].available).toBe(true);
    expect(a[1].available).toBe(false);
    expect((await p.getRegisterPrice("com", 2)).cost.amountMinor).toBe(1812);
  });

  it("scripts a dangerous ambiguous register outcome", async () => {
    const p = new FakeRegistrarProvider({
      registerResult: {
        "x.com": {
          outcome: "ambiguous_unknown",
          registered: false,
          correlation: {},
          errorCategory: "timeout",
        },
      },
    });
    const r = await p.register({
      domain: "x.com",
      years: 1,
      contacts: {
        registrant: contact(),
        admin: contact(),
        tech: contact(),
        billing: contact(),
      },
      enablePrivacy: true,
      idempotencyKey: "k",
    });
    expect(r.outcome).toBe("ambiguous_unknown");
    expect(r.registered).toBe(false);
  });

  it("default register succeeds and echoes correlation", async () => {
    const p = new FakeRegistrarProvider({ priceByTld: { com: 906 } });
    const r = await p.register({
      domain: "y.com",
      years: 1,
      contacts: {
        registrant: contact(),
        admin: contact(),
        tech: contact(),
        billing: contact(),
      },
      enablePrivacy: false,
      idempotencyKey: "k2",
    });
    expect(r.outcome).toBe("definitive_success");
    expect(r.registered).toBe(true);
    expect(r.correlation.orderId).toContain("k2");
  });
});

function contact() {
  return {
    firstName: "A",
    lastName: "B",
    address1: "1 St",
    city: "T",
    stateProvince: "CA",
    postalCode: "90001",
    country: "US",
    phone: "+1.5551234567",
    email: "a@example.com",
  };
}
