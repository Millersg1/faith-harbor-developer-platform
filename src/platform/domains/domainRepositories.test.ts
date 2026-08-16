import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { BlindIndex } from "./crypto/BlindIndex";
import { EnvelopeCipher } from "./crypto/EnvelopeCipher";
import { Keyring } from "./crypto/Keyring";
import { DomainContactRepository } from "./DomainContactRepository";
import { DomainRegistrationRepository } from "./DomainRegistrationRepository";
import type { RegistrarContact } from "./RegistrarContact";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 7).toString("base64") },
  encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 3).toString("base64") },
  blindActiveVersion: 1,
});

const contact: RegistrarContact = {
  firstName: "Jane",
  lastName: "Doe",
  address1: "1 Main St",
  city: "Town",
  stateProvince: "CA",
  postalCode: "90001",
  country: "US",
  phone: "+1 (555) 123-4567",
  email: "Jane@Example.com",
};

describe("DomainRegistrationRepository — tenant isolation (fail closed)", () => {
  it("throws when used with no tenant in scope", async () => {
    const repo = new DomainRegistrationRepository();
    await expect(repo.list()).rejects.toThrow();
  });

  it("never reads another tenant's registration", async () => {
    const repo = new DomainRegistrationRepository();
    await runWithTenant({ organizationId: "orgA" }, () =>
      repo.create({
        id: "r1",
        asciiDomain: "a.com",
        unicodeDomain: "a.com",
        tld: "com",
        provider: "namecheap",
        registeredAt: "2026-01-01T00:00:00Z",
      }),
    );
    // Tenant B cannot see or mutate it.
    await runWithTenant({ organizationId: "orgB" }, async () => {
      expect(await repo.get("r1")).toBeUndefined();
      expect(await repo.list()).toEqual([]);
      await repo.setDisposition("r1", "transferred_out"); // no-op cross-tenant
    });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const r = await repo.get("r1");
      expect(r?.disposition).toBe("retained_active"); // unchanged by tenant B
    });
  });
});

describe("DomainContactRepository — encryption at rest + isolation", () => {
  const mkRepo = () =>
    new DomainContactRepository(
      new EnvelopeCipher(keyring),
      new BlindIndex(keyring),
    );

  it("stores CIPHERTEXT (never plaintext) and round-trips via decrypt", async () => {
    const repo = mkRepo();
    let stored: string | undefined;
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await repo.putCurrent({
        id: "c1",
        registrationId: "r1",
        role: "registrant",
        contact,
        effectiveAt: "2026-01-01T00:00:00Z",
      });
      const hist = await repo.history("r1", "registrant");
      stored = hist[0].contactCiphertext;
      const back = await repo.getCurrent("r1", "registrant");
      expect(back).toEqual(contact);
    });
    // The stored column value must be an envelope, never the plaintext PII.
    expect(stored).toMatch(/^v1:1:/);
    expect(stored).not.toContain("Jane");
    expect(stored).not.toContain("Example.com");
    expect(stored).not.toContain("Main St");
  });

  it("computes blind indexes but never stores raw email/phone", async () => {
    const repo = mkRepo();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await repo.putCurrent({
        id: "c1",
        registrationId: "r1",
        role: "registrant",
        contact,
        effectiveAt: "2026-01-01T00:00:00Z",
      });
      const row = (await repo.history("r1", "registrant"))[0];
      expect(row.emailBlindIndex).toMatch(/^1:[0-9a-f]{64}$/);
      expect(row.emailBlindIndex).not.toContain("jane");
      expect(row.phoneBlindIndex).toMatch(/^1:[0-9a-f]{64}$/);
    });
  });

  it("another tenant cannot read the contact (scope + AAD)", async () => {
    const repo = mkRepo();
    await runWithTenant({ organizationId: "orgA" }, () =>
      repo.putCurrent({
        id: "c1",
        registrationId: "r1",
        role: "registrant",
        contact,
        effectiveAt: "2026-01-01T00:00:00Z",
      }),
    );
    await runWithTenant({ organizationId: "orgB" }, async () => {
      // Tenant scope hides the row entirely.
      expect(await repo.getCurrent("r1", "registrant")).toBeUndefined();
    });
  });

  it("keeps immutable version history; a correction adds a new current version", async () => {
    const repo = mkRepo();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await repo.putCurrent({
        id: "c1",
        registrationId: "r1",
        role: "registrant",
        contact,
        effectiveAt: "2026-01-01T00:00:00Z",
      });
      await repo.putCurrent({
        id: "c2",
        registrationId: "r1",
        role: "registrant",
        contact: { ...contact, address1: "2 New Rd" },
        effectiveAt: "2026-02-01T00:00:00Z",
      });
      const hist = await repo.history("r1", "registrant");
      expect(hist.map((h) => h.version)).toEqual([2, 1]);
      expect(hist.filter((h) => h.isCurrent)).toHaveLength(1);
      expect(hist[0].isCurrent).toBe(true);
      const current = await repo.getCurrent("r1", "registrant");
      expect(current?.address1).toBe("2 New Rd");
    });
  });
});
