import { describe, expect, it } from "vitest";

import type { AuthoritativeDnsProvider } from "../dns/dnsAuthority";
import type { DnsRecord, DnsRecordChange, DomainRegistrarProvider, RegistrarOutcome } from "../RegistrarProvider";
import { OneShotAuthorization, OneShotGuardError } from "./oteRegisterOnce";
import {
  ADD_ONE_OTE_TXT_ACK,
  DELETE_ONE_OTE_TXT_ACK,
  addOneTxtRecord,
  assertManagedAuthority,
  deleteOneTxtRecord,
  previewTxtAddition,
} from "./oteDnsOnce";

const PROVIDERS: AuthoritativeDnsProvider[] = [
  { provider: "namesilo", nsSuffixes: ["dnsowl.com"], recordManagement: "supported" },
  { provider: "cpanel", nsSuffixes: ["allelitehosting.com"], recordManagement: "externally_managed" },
];
const NS_MANAGED = ["ns1.dnsowl.com", "ns2.dnsowl.com", "ns3.dnsowl.com"];
const HOST = "aec-step3-abc123";
const VALUE = "aec-step3-marker-xyz";
const DOMAIN = "aec-ote-x.com";

/** Stateful stub: baseline → afterAdd → afterDelete, counting calls + capturing the delete change. */
function stub(opts: {
  baseline?: DnsRecord[];
  throwOnBaseline?: boolean;
  addOutcome?: RegistrarOutcome;
  addRecordId?: string;
  afterAddOverride?: DnsRecord[];
  deleteOutcome?: RegistrarOutcome;
  afterDeleteOverride?: DnsRecord[];
  addNoRef?: boolean;
} = {}) {
  const base = opts.baseline ?? [];
  const calls = { list: 0, apply: 0 };
  let phase: "baseline" | "afterAdd" | "afterDelete" = "baseline";
  let added: DnsRecord | undefined;
  let lastDeleteChange: DnsRecordChange | undefined;
  const reg: Partial<DomainRegistrarProvider> = {
    async getDnsRecords(): Promise<DnsRecord[]> {
      calls.list++;
      if (opts.throwOnBaseline && phase === "baseline") { throw Object.assign(new Error("dns backend"), { name: "NamecheapApiError", number: "201" }); }
      if (phase === "afterAdd") return opts.afterAddOverride ?? (added ? [...base, added] : base);
      if (phase === "afterDelete") return opts.afterDeleteOverride ?? base;
      return base;
    },
    async applyDnsRecords(_d: string, changes: DnsRecordChange[]) {
      calls.apply++;
      const ch = changes[0];
      if (ch.op === "upsert") {
        added = { ...ch.record, providerRecordId: opts.addRecordId ?? "RID1" };
        phase = "afterAdd";
        return { outcome: opts.addOutcome ?? "definitive_success", applied: true, providerCorrelationId: opts.addNoRef ? undefined : "ADDREF" };
      }
      lastDeleteChange = ch;
      phase = "afterDelete";
      return { outcome: opts.deleteOutcome ?? "definitive_success", applied: true, providerCorrelationId: "DELREF" };
    },
  };
  return { registrar: reg as DomainRegistrarProvider, calls, getDelete: () => lastDeleteChange };
}

const deps = (registrar: DomainRegistrarProvider) => ({ registrar, providers: PROVIDERS, now: () => "2026-08-25T00:00:00Z", newId: () => "idem" });
const addReq = (over: Record<string, unknown> = {}) => ({ domain: DOMAIN, nameservers: NS_MANAGED, authorityFresh: true, host: HOST, value: VALUE, ttl: 3600, acknowledgment: ADD_ONE_OTE_TXT_ACK, auth: new OneShotAuthorization(ADD_ONE_OTE_TXT_ACK), ...over });

describe("Step 3 — authority gate (zero mutation unless managed + fresh)", () => {
  it("fresh managed NameSilo authority permits the operation", () => {
    expect(() => assertManagedAuthority(NS_MANAGED, PROVIDERS, true)).not.toThrow();
  });
  it.each([
    ["stale", NS_MANAGED, false, "authority_stale"],
    ["external", ["ns1.cloudflare.com", "ns2.cloudflare.com"], true, "authority_not_managed:external"],
    ["unknown (empty)", [], true, "authority_not_managed:unknown"],
    ["cross-provider mix", ["ns1.dnsowl.com", "ns2.allelitehosting.com"], true, "authority_not_managed:external"],
    ["externally_managed (cpanel)", ["ns1.allelitehosting.com"], true, "authority_not_managed:cpanel"],
  ])("%s authority makes ZERO calls", async (_n, ns, fresh, code) => {
    expect(() => assertManagedAuthority(ns as string[], PROVIDERS, fresh as boolean)).toThrow(OneShotGuardError);
    const { registrar, calls } = stub();
    await expect(addOneTxtRecord(deps(registrar), addReq({ nameservers: ns, authorityFresh: fresh }))).rejects.toMatchObject({ code });
    expect(calls.list + calls.apply).toBe(0);
  });
});

describe("Step 3 — preview before apply (only the intended addition)", () => {
  it("previews exactly one TXT addition, no modification/deletion", () => {
    const pv = previewTxtAddition([{ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 }], { type: "TXT", host: HOST, value: VALUE, ttl: 3600 });
    expect(pv.additions).toHaveLength(1);
    expect(pv.modifications).toHaveLength(0);
    expect(pv.deletions).toHaveLength(0);
    expect(pv.protectedConflicts).toHaveLength(0);
  });
  it.each([
    ["apex", { type: "TXT", host: "@", value: "v", ttl: 3600 }, "apex_forbidden"],
    ["wildcard", { type: "TXT", host: "*.x", value: "v", ttl: 3600 }, "wildcard_forbidden"],
    ["non-TXT", { type: "A", host: "x", value: "1.2.3.4", ttl: 3600 }, "type_not_txt"],
    ["protected (_dmarc TXT)", { type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none", ttl: 3600 }, "protected_record_forbidden"],
  ])("rejects a %s change", (_n, rec, code) => {
    expect(() => previewTxtAddition([], rec as DnsRecord)).toThrow(new RegExp(code));
  });
  it("duplicate prevention: refuses when a TXT already exists at the host", () => {
    expect(() => previewTxtAddition([{ type: "TXT", host: HOST, value: "old", ttl: 3600 }], { type: "TXT", host: HOST, value: VALUE, ttl: 3600 }))
      .toThrow(/duplicate_host/);
  });
});

describe("Step 3 — one-shot add", () => {
  it("adds exactly one TXT and reconciles to the record id; sanitized audit carries fingerprints, not raw values", async () => {
    const { registrar, calls } = stub({ addRecordId: "RID-777" });
    const r = await addOneTxtRecord(deps(registrar), addReq());
    expect(r.classification).toBe("added");
    expect(r.recordId).toBe("RID-777");
    expect(r.matchCount).toBe(1);
    expect(calls.apply).toBe(1); // exactly one mutation
    // Sanitized audit: 12-hex fingerprints, provider ref hashed, no raw host/value.
    expect(r.audit.hostFingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(r.audit.valueFingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(r.audit.providerRefHash).toMatch(/^[0-9a-f]{12}$/);
    const j = JSON.stringify(r.audit);
    expect(j).not.toContain(HOST);
    expect(j).not.toContain(VALUE);
  });
  it("is one-shot: a reused authorization throws, no second mutation", async () => {
    const auth = new OneShotAuthorization(ADD_ONE_OTE_TXT_ACK);
    const s1 = stub();
    await addOneTxtRecord(deps(s1.registrar), addReq({ auth }));
    const s2 = stub(); // fresh (empty) baseline so we reach the auth, not duplicate_host
    await expect(addOneTxtRecord(deps(s2.registrar), addReq({ auth }))).rejects.toMatchObject({ code: "already_consumed" });
    expect(s2.calls.apply).toBe(0);
  });
  it("provider_rejection => rejected, no reconciliation", async () => {
    const { registrar, calls } = stub({ addOutcome: "provider_rejection" });
    const r = await addOneTxtRecord(deps(registrar), addReq());
    expect(r.classification).toBe("rejected");
    expect(calls.list).toBe(1); // baseline only, no verify
  });
  it("a provider baseline error (e.g. OTE 201) aborts with ZERO mutation", async () => {
    const { registrar, calls } = stub({ throwOnBaseline: true });
    await expect(addOneTxtRecord(deps(registrar), addReq())).rejects.toMatchObject({ number: "201" });
    expect(calls.apply).toBe(0);
  });
  it("ambiguous add resolves to added ONLY if the record is found, else needs_attention", async () => {
    const yes = stub({ addOutcome: "ambiguous_unknown", addRecordId: "RID-9" });
    expect((await addOneTxtRecord(deps(yes.registrar), addReq())).classification).toBe("added");
    const no = stub({ addOutcome: "ambiguous_unknown", afterAddOverride: [] }); // record not present after
    const r = await addOneTxtRecord(deps(no.registrar), addReq());
    expect(r.classification).toBe("needs_attention");
    expect(no.calls.apply).toBe(1); // never resubmitted
  });
  it("a success with no provider reference reports reference_absent (never an empty pretend-id)", async () => {
    const { registrar } = stub({ addNoRef: true }); // empty baseline, add returns no providerCorrelationId
    const r = await addOneTxtRecord(deps(registrar), addReq());
    expect(r.classification).toBe("added");
    expect(r.audit.providerRefHash).toBe("reference_absent");
  });
});

describe("Step 3 — one-shot delete (bound to record id) + preservation", () => {
  const delReq = (over: Record<string, unknown> = {}) => ({ domain: DOMAIN, nameservers: NS_MANAGED, authorityFresh: true, recordId: "RID-777", host: HOST, value: VALUE, baseline: [] as DnsRecord[], acknowledgment: DELETE_ONE_OTE_TXT_ACK, auth: new OneShotAuthorization(DELETE_ONE_OTE_TXT_ACK), ...over });

  it("deletes by record id, confirms absent + baseline preserved", async () => {
    const baseline: DnsRecord[] = [{ providerRecordId: "B1", type: "A", host: "@", value: "1.2.3.4", ttl: 3600 }];
    const st = stub({ baseline, afterDeleteOverride: baseline }); // added record gone, baseline intact
    const r = await deleteOneTxtRecord(deps(st.registrar), delReq({ baseline }));
    expect(r.classification).toBe("deleted");
    expect(r.absent).toBe(true);
    expect(r.baselinePreserved).toBe(true);
    // delete change bound to the record id, not host/type alone.
    expect(st.getDelete()).toMatchObject({ op: "delete", record: { providerRecordId: "RID-777" } });
  });
  it("refuses a delete with no record id (never host/type alone), zero mutation", async () => {
    const { registrar, calls } = stub();
    await expect(deleteOneTxtRecord(deps(registrar), delReq({ recordId: "" }))).rejects.toMatchObject({ code: "delete_requires_record_id" });
    expect(calls.apply).toBe(0);
  });
  it("flags baseline NOT preserved as needs_attention (a baseline record went missing)", async () => {
    const baseline: DnsRecord[] = [{ providerRecordId: "B1", type: "MX", host: "@", value: "mail", ttl: 3600 }];
    const st = stub({ baseline, afterDeleteOverride: [] }); // baseline MX vanished too
    const r = await deleteOneTxtRecord(deps(st.registrar), delReq({ baseline }));
    expect(r.baselinePreserved).toBe(false);
    expect(r.classification).toBe("needs_attention");
  });
  it("ambiguous delete resolves to deleted only if now absent, else needs_attention (never repeats)", async () => {
    const gone = stub({ deleteOutcome: "ambiguous_unknown", afterDeleteOverride: [] });
    expect((await deleteOneTxtRecord(deps(gone.registrar), delReq())).classification).toBe("deleted");
    const still = stub({ deleteOutcome: "ambiguous_unknown", afterDeleteOverride: [{ providerRecordId: "RID-777", type: "TXT", host: HOST, value: VALUE, ttl: 3600 }] });
    const r = await deleteOneTxtRecord(deps(still.registrar), delReq());
    expect(r.classification).toBe("needs_attention");
    expect(still.calls.apply).toBe(1); // not repeated
  });
});
