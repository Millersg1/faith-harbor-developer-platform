import { describe, expect, it } from "vitest";

import { createIsolatedOteHarness, HarnessBlockedError } from "./IsolatedOteHarness";
import {
  describePreflight,
  preflightOteAcceptance,
  type PreflightEnv,
} from "./oteAcceptancePreflight";

/** A fully-valid TEST config (synthetic strings — NOT real credentials). */
function validEnv(over: PreflightEnv = {}): PreflightEnv {
  return {
    RUN_DOMAIN_OTE_ACCEPTANCE: "1",
    STRIPE_DOMAIN_TEST_SECRET_KEY: "sk_test_EXAMPLE_not_real",
    STRIPE_DOMAIN_TEST_WEBHOOK_SECRET: "whsec_test_EXAMPLE",
    NAMESILO_OTE_ENDPOINT: "https://ote.namesilo.com/api",
    NAMESILO_OTE_API_KEY: "ote_EXAMPLE_not_real",
    DOMAIN_CONTACT_ENC_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
    DOMAIN_BLIND_INDEX_KEY_V1: Buffer.alloc(32, 2).toString("base64"),
    OTE_PG_URL: "postgres://tester@127.0.0.1:5432/ote_scratch",
    OTE_PG_SCHEMA: "ote_acceptance_1",
    OTE_CONFIRM_DISPOSABLE: "1",
    PRODUCTION_PG_DATABASE: "faithhosting_aecloud",
    OTE_HARNESS_PORT: "39117",
    OTE_BIND_HOST: "127.0.0.1",
    DOMAIN_OPERATIONS_MODE: "disabled",
    ...over,
  };
}

describe("Stage 12A — OTE acceptance preflight (fail closed)", () => {
  it("PASSes only when every safety property is proven", () => {
    const r = preflightOteAcceptance(validEnv());
    expect(r.readiness).toBe("PASS");
    expect(r.blockers).toEqual([]);
  });

  const cases: Array<[string, PreflightEnv, string]> = [
    ["missing acknowledgment", { RUN_DOMAIN_OTE_ACCEPTANCE: "" }, "acknowledgment"],
    ["Stripe LIVE key", { STRIPE_DOMAIN_TEST_SECRET_KEY: "sk_live_REAL" }, "stripe_secret"],
    ["Stripe key absent", { STRIPE_DOMAIN_TEST_SECRET_KEY: "" }, "stripe_secret"],
    ["Stripe webhook secret absent", { STRIPE_DOMAIN_TEST_WEBHOOK_SECRET: "" }, "stripe_webhook_secret"],
    ["NameSilo LIVE endpoint", { NAMESILO_OTE_ENDPOINT: "https://www.namesilo.com/api" }, "namesilo_endpoint"],
    ["unknown endpoint", { NAMESILO_OTE_ENDPOINT: "https://evil.example.com/api" }, "namesilo_endpoint"],
    ["OTE key absent", { NAMESILO_OTE_API_KEY: "" }, "namesilo_ote_key"],
    ["keyring absent", { DOMAIN_CONTACT_ENC_KEY_V1: "" }, "encryption_keyring"],
    ["public schema", { OTE_PG_SCHEMA: "public" }, "disposable_pg"],
    ["not confirmed disposable", { OTE_CONFIRM_DISPOSABLE: "" }, "disposable_pg"],
    ["pg matches production db", { OTE_PG_URL: "postgres://x@127.0.0.1:5432/faithhosting_aecloud" }, "disposable_pg"],
    ["production port", { OTE_HARNESS_PORT: "3300" }, "port_isolation"],
    ["non-loopback bind", { OTE_BIND_HOST: "0.0.0.0" }, "loopback_bind"],
    ["full mutations mode", { DOMAIN_OPERATIONS_MODE: "full" }, "mutations_disabled"],
    ["production purchasing enabled", { DOMAIN_PURCHASING_ENABLED: "true" }, "mutations_disabled"],
  ];
  for (const [name, over, expectedBlocker] of cases) {
    it(`fails closed: ${name}`, () => {
      const r = preflightOteAcceptance(validEnv(over));
      expect(r.readiness).toBe("BLOCKED");
      expect(r.blockers).toContain(expectedBlocker);
    });
  }

  it("the report is sanitized — never echoes secrets/keys", () => {
    const env = validEnv();
    const lines = describePreflight(preflightOteAcceptance(env)).join("\n");
    expect(lines).not.toContain(env.STRIPE_DOMAIN_TEST_SECRET_KEY);
    expect(lines).not.toContain(env.STRIPE_DOMAIN_TEST_WEBHOOK_SECRET);
    expect(lines).not.toContain(env.NAMESILO_OTE_API_KEY);
    expect(lines).not.toContain(env.DOMAIN_CONTACT_ENC_KEY_V1);
    // It DOES report classifications.
    expect(lines).toContain("stripe_secret: test");
    expect(lines).toContain("namesilo_endpoint: ote");
    expect(lines).toContain("READINESS: PASS");
  });
});

describe("Stage 12A — isolated harness refuses to start when blocked", () => {
  it("a blocked env cannot be started", async () => {
    const h = createIsolatedOteHarness({ RUN_DOMAIN_OTE_ACCEPTANCE: "" });
    expect(h.readiness).toBe("BLOCKED");
    await expect(h.start()).rejects.toBeInstanceOf(HarnessBlockedError);
  });

  it("with no credentials present at all, readiness is BLOCKED", () => {
    const h = createIsolatedOteHarness({});
    expect(h.readiness).toBe("BLOCKED");
    // Describe is safe to print and contains no secrets (there are none).
    expect(h.describe().at(-1)).toContain("READINESS: BLOCKED");
  });

  it("a valid TEST config reports PASS (without opening any connection)", () => {
    const h = createIsolatedOteHarness(validEnv());
    expect(h.readiness).toBe("PASS");
  });
});
