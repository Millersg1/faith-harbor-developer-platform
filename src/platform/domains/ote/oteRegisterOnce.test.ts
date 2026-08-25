import { describe, expect, it } from "vitest";

import type {
  AvailabilityResult,
  DomainRegistrarProvider,
  DomainStatus,
  RegisterResult,
  RegistrarOutcome,
} from "../RegistrarProvider";
import {
  OneShotAuthorization,
  OneShotGuardError,
  REGISTER_ONE_OTE_ACK,
  registerOneOteDomain,
} from "./oteRegisterOnce";

const CONTACT = { firstName: "Test", lastName: "User", address1: "1 Example St", city: "Testville", stateProvince: "CA", postalCode: "90001", country: "US", phone: "+1.5555550100", email: "aec-ote@example.com" };
const CONTACTS = { registrant: CONTACT, admin: CONTACT, tech: CONTACT, billing: CONTACT };

/** Minimal scriptable registrar that COUNTS register calls. */
function stub(opts: {
  available?: boolean;
  premium?: boolean;
  outcome?: RegistrarOutcome;
  status?: Partial<DomainStatus>;
  throwOnStatus?: boolean;
}) {
  const calls = { register: 0, availability: 0, status: 0 };
  const reg: Partial<DomainRegistrarProvider> = {
    async checkAvailability(domains: string[]): Promise<AvailabilityResult[]> {
      calls.availability++;
      return domains.map((d) => ({ domain: d, available: opts.available ?? true, isPremium: opts.premium ?? false }));
    },
    async register(): Promise<RegisterResult> {
      calls.register++;
      return { outcome: opts.outcome ?? "definitive_success", registered: opts.outcome === "definitive_success" || opts.outcome === undefined, correlation: { orderId: "ORDER-123" }, providerCorrelationId: "ORDER-123" };
    },
    async getRegistrationStatus(domain: string): Promise<DomainStatus> {
      calls.status++;
      if (opts.throwOnStatus) throw new Error("status timeout");
      return { domain, registered: true, expiresAt: "2027-01-01T00:00:00Z", locked: false, privacyEnabled: false, autoRenew: false, nameservers: ["ns1.dnsowl.com"], ...opts.status };
    },
  };
  return { registrar: reg as DomainRegistrarProvider, calls };
}

const req = (over: Record<string, unknown> = {}) => ({ domain: "aec-ote-20260101-abcd.com", years: 1, contacts: CONTACTS, acknowledgment: REGISTER_ONE_OTE_ACK, ...over });
const deps = (registrar: DomainRegistrarProvider, ack = REGISTER_ONE_OTE_ACK) => ({ registrar, auth: new OneShotAuthorization(ack), newId: () => "idem-1" });

describe("Stage 12A Step 2 — one-shot OTE register guard", () => {
  it("rejects a non-.com TLD before any provider call", async () => {
    const { registrar, calls } = stub({});
    await expect(registerOneOteDomain(deps(registrar), req({ domain: "aec-ote.net" }))).rejects.toMatchObject({ code: "tld_not_com" });
    expect(calls.register).toBe(0);
  });
  it("rejects a term other than one year", async () => {
    const { registrar, calls } = stub({});
    await expect(registerOneOteDomain(deps(registrar), req({ years: 2 }))).rejects.toMatchObject({ code: "term_not_one_year" });
    expect(calls.register).toBe(0);
  });
  it("rejects a premium classification (never registers a premium)", async () => {
    const { registrar, calls } = stub({ premium: true });
    await expect(registerOneOteDomain(deps(registrar), req())).rejects.toMatchObject({ code: "premium_rejected" });
    expect(calls.register).toBe(0);
  });
  it("rejects an unavailable domain", async () => {
    const { registrar, calls } = stub({ available: false });
    await expect(registerOneOteDomain(deps(registrar), req())).rejects.toMatchObject({ code: "not_available" });
    expect(calls.register).toBe(0);
  });
  it("rejects a wrong acknowledgment (auth not consumed, no register)", async () => {
    const { registrar, calls } = stub({});
    await expect(registerOneOteDomain(deps(registrar), req({ acknowledgment: "nope" }))).rejects.toMatchObject({ code: "bad_acknowledgment" });
    expect(calls.register).toBe(0);
  });
  it("is MAXIMUM ONE execution — a reused authorization throws, no second register", async () => {
    const { registrar, calls } = stub({});
    const d = deps(registrar);
    await registerOneOteDomain(d, req());
    expect(calls.register).toBe(1);
    await expect(registerOneOteDomain(d, req())).rejects.toMatchObject({ code: "already_consumed" });
    expect(calls.register).toBe(1); // still exactly one
  });
  it("an unarmed authorization cannot be consumed", () => {
    expect(() => new OneShotAuthorization("WRONG").consume(REGISTER_ONE_OTE_ACK)).toThrow(OneShotGuardError);
  });
});

describe("Stage 12A Step 2 — one-shot register result handling", () => {
  it("definitive_success => registered + read-only reconciliation, exactly one register", async () => {
    const { registrar, calls } = stub({ outcome: "definitive_success", status: { registered: true, locked: true } });
    const r = await registerOneOteDomain(deps(registrar), req());
    expect(r.classification).toBe("registered");
    expect(r.retry).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.providerRefHash).toMatch(/^[0-9a-f]{12}$/); // hashed, not the raw order id
    expect(r.reconciliation).toMatchObject({ registered: true, locked: true, autoRenew: false });
    expect(calls.register).toBe(1);
    expect(calls.status).toBe(1); // reconciliation is read-only
  });
  it("provider_rejection => rejected, no retry, no reconciliation", async () => {
    const { registrar, calls } = stub({ outcome: "provider_rejection" });
    const r = await registerOneOteDomain(deps(registrar), req());
    expect(r.classification).toBe("rejected");
    expect(r.retry).toBe(false);
    expect(calls.register).toBe(1);
    expect(calls.status).toBe(0);
  });
  it("definitive_failure => failed, no retry", async () => {
    const { registrar } = stub({ outcome: "definitive_failure" });
    const r = await registerOneOteDomain(deps(registrar), req());
    expect(r.classification).toBe("failed");
    expect(r.retry).toBe(false);
  });
  it("transport_failure_pre_acceptance => transport_unknown, no retry, no reconciliation", async () => {
    const { registrar, calls } = stub({ outcome: "transport_failure_pre_acceptance" });
    const r = await registerOneOteDomain(deps(registrar), req());
    expect(r.classification).toBe("transport_unknown");
    expect(calls.status).toBe(0);
  });
  it("ambiguous_unknown resolves to registered ONLY if status positively confirms it", async () => {
    const yes = stub({ outcome: "ambiguous_unknown", status: { registered: true } });
    expect((await registerOneOteDomain(deps(yes.registrar), req())).classification).toBe("registered");
    const no = stub({ outcome: "ambiguous_unknown", status: { registered: false } });
    expect((await registerOneOteDomain(deps(no.registrar), req())).classification).toBe("needs_attention");
    expect(no.calls.register).toBe(1); // never resubmitted
  });
  it("ambiguous_unknown with a failing reconciliation stays needs_attention (never resubmits)", async () => {
    const { registrar, calls } = stub({ outcome: "ambiguous_unknown", throwOnStatus: true });
    const r = await registerOneOteDomain(deps(registrar), req());
    expect(r.classification).toBe("needs_attention");
    expect(calls.register).toBe(1);
  });
});
