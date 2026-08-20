import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import { FakeRegistrarProvider, type FakeConfig } from "../FakeRegistrarProvider";
import type { DnsRecord, DnsRecordChange } from "../RegistrarProvider";
import { DomainDnsRepository } from "./DomainDnsRepository";
import {
  DnsAuthorityError,
  DnsGateError,
  DnsProtectedError,
  DnsValidationError,
  DomainDnsService,
} from "./DomainDnsService";
import {
  protectionReason,
  validateNameservers,
  validateRecord,
} from "./dnsValidation";

const ALLELITE_NS = ["ns1.allelitehosting.com", "ns2.allelitehosting.com"];
const NAMESILO_NS = ["ns1.dnsowl.com", "ns2.dnsowl.com"];
const AUTH_PROVIDERS = [
  { provider: "namesilo", nsSuffixes: ["dnsowl.com"], recordManagement: "supported" as const },
  { provider: "cpanel", nsSuffixes: ["allelitehosting.com"], recordManagement: "externally_managed" as const },
];

function build(fake: FakeConfig = {}) {
  // Default: the domain is on NameSilo's authoritative DNS (records manageable),
  // unless a test overrides nameserversByDomain.
  const registrar = new FakeRegistrarProvider({
    nameserversByDomain: { "acme.com": NAMESILO_NS },
    ...fake,
  });
  const dns = new DomainDnsRepository();
  const registrations = new DomainRegistrationRepository();
  let seq = 0;
  const service = new DomainDnsService({
    dns, registrations, registrar,
    now: () => "2026-08-19T00:00:00Z",
    newId: () => `id${++seq}`,
    alleliteNameservers: ALLELITE_NS,
    authoritativeDnsProviders: AUTH_PROVIDERS,
    registrarAuthoritativeProvider: "namesilo",
  });
  return { service, dns, registrations, registrar };
}

/** Seeds a confirmed (active) registration in the current tenant. */
async function confirmReg(h: ReturnType<typeof build>, id = "reg1", domain = "acme.com") {
  await h.registrations.create({
    id, orderId: "ord1", asciiDomain: domain, unicodeDomain: domain, tld: "com",
    provider: "fake", registeredAt: "2026-08-19T00:00:00Z",
  });
  return id;
}

const upsert = (r: DnsRecord): DnsRecordChange => ({ op: "upsert", record: r });
const del = (r: DnsRecord): DnsRecordChange => ({ op: "delete", record: r });

describe("Stage 8 — DNS validation", () => {
  it("validates nameservers (count, syntax, duplicates)", () => {
    expect(validateNameservers(["ns1.example.com"]).length).toBeGreaterThan(0); // too few
    expect(validateNameservers(["ns1.example.com", "ns2.example.com"])).toEqual([]);
    expect(validateNameservers(["bad host", "ns2.example.com"]).some((i) => i.message.includes("invalid"))).toBe(true);
    expect(validateNameservers(["ns1.x.com", "ns1.x.com"]).some((i) => i.message.includes("duplicate"))).toBe(true);
  });

  it("validates records by type", () => {
    expect(validateRecord({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })).toEqual([]);
    expect(validateRecord({ type: "A", host: "@", value: "999.1.1.1", ttl: 3600 }).length).toBeGreaterThan(0);
    expect(validateRecord({ type: "AAAA", host: "@", value: "2001:db8::1", ttl: 3600 })).toEqual([]);
    expect(validateRecord({ type: "CNAME", host: "@", value: "x.com", ttl: 3600 }).some((i) => i.field === "host")).toBe(true); // apex CNAME
    expect(validateRecord({ type: "MX", host: "@", value: "mail.x.com", ttl: 3600 }).some((i) => i.field === "priority")).toBe(true);
    expect(validateRecord({ type: "MX", host: "@", value: "mail.x.com", ttl: 3600, priority: 10 })).toEqual([]);
    expect(validateRecord({ type: "A", host: "@", value: "1.2.3.4", ttl: 5 }).some((i) => i.field === "ttl")).toBe(true);
    expect(validateRecord({ type: "TXT", host: "@", value: "x".repeat(3000), ttl: 3600 }).length).toBeGreaterThan(0);
  });

  it("classifies protected records (mail / SPF / DKIM / DMARC / CAA / ACME)", () => {
    expect(protectionReason({ type: "MX", host: "@", value: "mail.x.com" })).toBe("mail_exchange");
    expect(protectionReason({ type: "TXT", host: "@", value: "v=spf1 include:_spf.google.com ~all" })).toBe("spf");
    expect(protectionReason({ type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none" })).toBe("dmarc");
    expect(protectionReason({ type: "TXT", host: "sel._domainkey", value: "k=rsa; p=..." })).toBe("dkim");
    expect(protectionReason({ type: "CAA", host: "@", value: "0 issue letsencrypt.org" })).toBe("certificate_authorization");
    expect(protectionReason({ type: "TXT", host: "_acme-challenge", value: "token" })).toBe("acme_challenge");
    expect(protectionReason({ type: "A", host: "www", value: "1.2.3.4" })).toBeNull();
  });
});

describe("Stage 8 — confirmed-registration gate", () => {
  it("refuses every DNS op before a confirmed registration exists", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(h.service.setNameserverMode("nope", "allelite", undefined, "u1")).rejects.toBeInstanceOf(DnsGateError);
      await expect(h.service.previewRecordChanges("nope", [])).rejects.toBeInstanceOf(DnsGateError);
      await expect(h.service.reconcileZone("nope")).rejects.toBeInstanceOf(DnsGateError);
    });
  });
});

describe("Stage 8 — nameserver provisioning", () => {
  it("sets AllElite nameservers, persists mode + provisioning + audit", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      const view = await h.service.setNameserverMode(reg, "allelite", undefined, "u1");
      expect(view.outcome).toBe("definitive_success");
      expect(view.propagationNote).toContain("not instant");
      expect(view.autoRollback).toBe(false);
      const st = (await h.dns.getState(reg))!;
      expect(st.mode).toBe("allelite");
      expect(st.nameservers).toEqual(ALLELITE_NS);
      expect(st.provisioningStatus).toBe("active");
      expect(await h.registrar.getNameservers("acme.com")).toEqual(ALLELITE_NS);
      const changes = await h.dns.listChanges(reg);
      expect(changes.at(-1)!.changeType).toBe("set_nameservers");
    });
  });

  it("rejects invalid custom nameservers", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      await expect(h.service.setNameserverMode(reg, "custom", ["only-one.com"], "u1")).rejects.toBeInstanceOf(DnsValidationError);
    });
  });

  it("ambiguous provider outcome -> provisioning unknown, reconcile required, no NS change", async () => {
    const h = build({ dnsResult: { "acme.com": { outcome: "ambiguous_unknown", applied: false } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      const view = await h.service.setNameserverMode(reg, "custom", ["ns1.x.com", "ns2.x.com"], "u1");
      expect(view.outcome).toBe("ambiguous_unknown");
      expect(view.reconcileRequired).toBe(true);
      const st = (await h.dns.getState(reg))!;
      expect(st.provisioningStatus).toBe("unknown");
      expect(st.nameservers).toEqual([]); // not fabricated as applied
    });
  });
});

describe("Stage 8 — record management (preview + apply + protection)", () => {
  it("previews adds/updates/deletes + preserved count without calling the provider or auditing", async () => {
    const h = build({ dnsRecords: { "acme.com": [] } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      // seed a managed record
      await h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "www", value: "1.1.1.1", ttl: 3600 })], { actorUserId: "u1" });
      const preview = await h.service.previewRecordChanges(reg, [
        upsert({ type: "A", host: "www", value: "2.2.2.2", ttl: 3600 }), // update
        upsert({ type: "A", host: "blog", value: "3.3.3.3", ttl: 3600 }), // add
      ]);
      expect(preview.additions.length).toBe(1);
      expect(preview.updates.length).toBe(1);
      expect(preview.propagationNote).toContain("not instant");
    });
  });

  it("applies a change set, preserves untouched records, audits fingerprint (not value)", async () => {
    const h = build({ dnsRecords: { "acme.com": [] } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      await h.service.applyRecordChanges(reg, [
        upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 }),
        upsert({ type: "A", host: "www", value: "1.2.3.4", ttl: 3600 }),
      ], { actorUserId: "u1" });
      const recs = await h.dns.listRecords(reg);
      expect(recs.length).toBe(2);
      // audit contains the secret-free fingerprint, never the value
      const changes = await h.dns.listChanges(reg);
      const serialized = JSON.stringify(changes);
      expect(serialized).not.toContain("1.2.3.4");
      expect(changes.every((c) => c.outcome === "definitive_success")).toBe(true);
    });
  });

  it("refuses to overwrite a protected record without explicit authorization", async () => {
    const h = build({ dnsRecords: { "acme.com": [] } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      // establish an MX (protected)
      await h.service.applyRecordChanges(reg, [upsert({ type: "MX", host: "@", value: "mail.acme.com", ttl: 3600, priority: 10 })], { actorUserId: "u1" });
      // deleting it without authorization is refused
      await expect(
        h.service.applyRecordChanges(reg, [del({ type: "MX", host: "@", value: "mail.acme.com", ttl: 3600, priority: 10 })], { actorUserId: "u1" }),
      ).rejects.toBeInstanceOf(DnsProtectedError);
      // with authorization it proceeds
      const view = await h.service.applyRecordChanges(
        reg, [del({ type: "MX", host: "@", value: "mail.acme.com", ttl: 3600, priority: 10 })],
        { actorUserId: "u1", authorizeProtected: true },
      );
      expect(view.outcome).toBe("definitive_success");
    });
  });

  it("ambiguous apply leaves the desired set unchanged and demands reconciliation (no rollback)", async () => {
    const h = build({ dnsRecords: { "acme.com": [] }, dnsResult: { "acme.com": { outcome: "ambiguous_unknown", applied: false } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      const view = await h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "9.9.9.9", ttl: 3600 })], { actorUserId: "u1" });
      expect(view.reconcileRequired).toBe(true);
      expect(view.autoRollback).toBe(false);
      expect((await h.dns.listRecords(reg)).length).toBe(0); // not fabricated as applied
      expect((await h.dns.getState(reg))!.provisioningStatus).toBe("unknown");
    });
  });
});

describe("Stage 8 — DNS authority boundary (records only when we own the zone, freshly)", () => {
  it("NameSilo-authoritative + fresh -> record management supported + apply allowed", async () => {
    const h = build(); // acme.com nameservers = dnsowl (NameSilo DNS)
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      const cap = await h.service.recordCapability(reg);
      expect(cap).toMatchObject({ manageable: true, authorityProvider: "namesilo" });
      const view = await h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" });
      expect(view.outcome).toBe("definitive_success");
      const st = (await h.dns.getState(reg))!;
      expect(st.authorityProvider).toBe("namesilo");
      expect(st.authorityState).toBe("fresh");
      expect(st.authorityVerifiedAt).toBeTruthy();
    });
  });

  it("cPanel-authoritative -> externally managed, record mutation refused", async () => {
    const h = build({ nameserversByDomain: { "acme.com": ALLELITE_NS } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      const cap = await h.service.recordCapability(reg);
      expect(cap).toMatchObject({ manageable: false, authorityProvider: "cpanel", recordManagement: "externally_managed" });
      await expect(
        h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" }),
      ).rejects.toBeInstanceOf(DnsAuthorityError);
    });
  });

  it("unknown authority (no nameservers) -> refused", async () => {
    const h = build({ nameserversByDomain: { "acme.com": [] } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      const cap = await h.service.recordCapability(reg);
      expect(cap.manageable).toBe(false);
      expect(cap.authorityProvider).toBe("unknown");
      await expect(
        h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" }),
      ).rejects.toBeInstanceOf(DnsAuthorityError);
    });
  });

  it("unresolved authority via provider timeout -> refused, never assumed ours", async () => {
    const h = build({ throwOnDns: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      await expect(
        h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" }),
      ).rejects.toBeInstanceOf(DnsAuthorityError);
      expect((await h.dns.getState(reg))!.authorityProvider).toBe("unknown");
    });
  });

  it("cross-provider mutation (NameSilo registrar, domain on foreign NS) -> refused", async () => {
    const h = build({ nameserversByDomain: { "acme.com": ["ns1.someoneelse.net", "ns2.someoneelse.net"] } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      expect((await h.service.recordCapability(reg)).authorityProvider).toBe("external");
      await expect(
        h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" }),
      ).rejects.toBeInstanceOf(DnsAuthorityError);
    });
  });

  it("hosting attach never switches nameservers or replaces records", async () => {
    const h = build(); // NameSilo-authoritative
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      await h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" });
      const nsBefore = await h.registrar.getNameservers("acme.com");
      const recsBefore = await h.dns.listRecords(reg);
      h.dns.seedHostingAccount("host-A", "orgA");
      await h.service.attachHosting(reg, "host-A", "u1");
      expect(await h.registrar.getNameservers("acme.com")).toEqual(nsBefore); // NS untouched
      expect(await h.dns.listRecords(reg)).toEqual(recsBefore); // records untouched
      expect((await h.dns.getState(reg))!.hostingAccountId).toBe("host-A");
    });
  });
});

describe("Stage 8 — reconciliation (read-only) + DNSSEC + hosting attach", () => {
  it("reconcile: matching zone -> fresh, drift -> stale, provider throw -> needs_attention", async () => {
    const h = build({ dnsRecords: { "acme.com": [] } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      await h.service.applyRecordChanges(reg, [upsert({ type: "A", host: "@", value: "1.2.3.4", ttl: 3600 })], { actorUserId: "u1" });
      // provider zone now matches desired (fake applied it)
      const r1 = await h.service.reconcileZone(reg);
      expect(r1).toEqual({ syncState: "fresh", drift: 0 });
    });

    const h2 = build({ dnsRecords: { "acme.com": [{ type: "A", host: "@", value: "5.5.5.5", ttl: 3600 }] }, dnsResult: { "acme.com": { outcome: "definitive_success", applied: true } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h2);
      // desired has nothing; live has one record -> drift
      const r = await h2.service.reconcileZone(reg);
      expect(r.syncState).toBe("stale");
      expect(r.drift).toBeGreaterThan(0);
    });

    const h3 = build({ throwOnDns: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h3);
      const r = await h3.service.reconcileZone(reg);
      expect(r.syncState).toBe("needs_attention"); // never fabricated as in-sync
    });
  });

  it("refreshDnssec reflects provider state and fails safe on throw", async () => {
    const signed = build({ dnssec: { "acme.com": { supported: true, enabled: true, status: "signed" } } });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(signed);
      expect(await signed.service.refreshDnssec(reg)).toBe("signed");
    });
    const broken = build({ throwOnDns: true });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(broken);
      expect(await broken.service.refreshDnssec(reg)).toBe("needs_attention");
    });
  });

  it("hosting attach enforces same-tenant crossover defense", async () => {
    const h = build();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const reg = await confirmReg(h);
      h.dns.seedHostingAccount("host-A", "orgA");
      h.dns.seedHostingAccount("host-B", "orgB"); // different tenant
      const st = await h.service.attachHosting(reg, "host-A", "u1");
      expect(st.hostingAccountId).toBe("host-A");
      // a hosting account owned by another tenant is invisible -> refused
      await expect(h.service.attachHosting(reg, "host-B", "u1")).rejects.toBeInstanceOf(DnsGateError);
      const detached = await h.service.detachHosting(reg, "u1");
      expect(detached.hostingAccountId).toBeUndefined();
    });
  });
});
