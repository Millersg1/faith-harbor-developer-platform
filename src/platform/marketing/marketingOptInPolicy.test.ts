import { describe, expect, it } from "vitest";

import { resolveOptInPolicy } from "./marketingOptInPolicy";
import {
  MarketingActivationRepository,
  MarketingActivationService,
  type ActivationGates,
} from "./MarketingActivationService";

describe("resolveOptInPolicy — untrusted origins force double opt-in", () => {
  const base = {
    originAllowlisted: false,
    allowAnyOrigin: false,
    formDoubleOptIn: false, // tenant configured SINGLE opt-in
  };

  it("no Origin (server-to-server) forces double opt-in", () => {
    expect(resolveOptInPolicy({ ...base, origin: undefined })).toEqual({
      doubleOptIn: true,
      forced: true,
    });
  });

  it("Origin: null forces double opt-in", () => {
    expect(
      resolveOptInPolicy({ ...base, origin: "null", originAllowlisted: false }),
    ).toEqual({ doubleOptIn: true, forced: true });
  });

  it("allowAnyOrigin forces double opt-in even with a present Origin", () => {
    expect(
      resolveOptInPolicy({
        origin: "https://somewhere.example",
        originAllowlisted: true,
        allowAnyOrigin: true,
        formDoubleOptIn: false,
      }),
    ).toEqual({ doubleOptIn: true, forced: true });
  });

  it("a specifically allowlisted Origin follows the tenant's SINGLE opt-in choice", () => {
    expect(
      resolveOptInPolicy({
        origin: "https://acme-site.example",
        originAllowlisted: true,
        allowAnyOrigin: false,
        formDoubleOptIn: false,
      }),
    ).toEqual({ doubleOptIn: false, forced: false });
  });

  it("a specifically allowlisted Origin follows the tenant's DOUBLE opt-in choice", () => {
    expect(
      resolveOptInPolicy({
        origin: "https://acme-site.example",
        originAllowlisted: true,
        allowAnyOrigin: false,
        formDoubleOptIn: true,
      }),
    ).toEqual({ doubleOptIn: true, forced: false });
  });
});

// Prove the end result: a forced-double-opt-in activation creates NO active
// enrollment (and thus no first marketing outbox row) before confirmation.
function gates(enrollCalls: string[]): ActivationGates {
  return {
    consentOk: async () => true,
    suppressed: async () => false,
    leadActive: async () => true,
    sequenceValid: async () => "ok",
    enroll: async (a) => {
      enrollCalls.push(a.email);
      return "enrolled";
    },
  };
}

describe("forced double opt-in → no marketing enrollment before confirmation", () => {
  for (const scenario of [
    { name: "no Origin", ctx: { origin: undefined, originAllowlisted: false, allowAnyOrigin: false, formDoubleOptIn: false } },
    { name: "Origin: null", ctx: { origin: "null", originAllowlisted: false, allowAnyOrigin: false, formDoubleOptIn: false } },
    { name: "allowAnyOrigin", ctx: { origin: "https://x.example", originAllowlisted: true, allowAnyOrigin: true, formDoubleOptIn: false } },
  ] as const) {
    it(`${scenario.name}: lead-magnet may proceed but NO active enrollment until confirm`, async () => {
      const decision = resolveOptInPolicy(scenario.ctx);
      expect(decision.doubleOptIn).toBe(true); // forced

      const repo = new MarketingActivationRepository();
      const svc = new MarketingActivationService(repo);
      await svc.createIntent({
        organizationId: "orgA",
        formId: "form-1",
        sequenceId: "seq-A",
        email: "dana@x.com",
        consentVersion: "v1",
        doubleOptIn: decision.doubleOptIn, // forced true → 'awaiting_confirmation'
      });
      const enrollCalls: string[] = [];
      // Worker runs BEFORE confirmation → nothing enrolled (no outbox seed).
      expect(await svc.activateReady(gates(enrollCalls))).toHaveLength(0);
      expect(enrollCalls).toHaveLength(0);

      // Only the recipient's confirmation makes it ready → then it enrolls.
      await svc.confirm("orgA", "dana@x.com", "v1", "form-1");
      await svc.activateReady(gates(enrollCalls));
      expect(enrollCalls).toEqual(["dana@x.com"]);
    });
  }
});
