import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../../tenancy/TenantContext";
import { BlindIndex } from "../crypto/BlindIndex";
import { EnvelopeCipher } from "../crypto/EnvelopeCipher";
import { Keyring } from "../crypto/Keyring";
import { DomainContactRepository } from "../DomainContactRepository";
import type { RegistrarContact } from "../RegistrarContact";
import {
  authorizeDomainAction,
  requiresReauth,
} from "./contactAuthPolicy";
import {
  assertContactMeetsTld,
  ContactValidationError,
  normalizeContact,
  UnsupportedTldRequirementError,
} from "./contactValidation";
import {
  DomainContactAuthError,
  DomainContactService,
} from "./DomainContactService";

const keyring = new Keyring({
  encKeys: { 1: Buffer.alloc(32, 5).toString("base64") },
  encActiveVersion: 1,
  blindKeys: { 1: Buffer.alloc(32, 6).toString("base64") },
  blindActiveVersion: 1,
});

const contact: RegistrarContact = {
  firstName: " Jane ",
  lastName: "Doe",
  address1: "1 Main St",
  city: "Town",
  stateProvince: "CA",
  postalCode: "90001",
  country: "us",
  phone: "+1 (555) 123-4567",
  email: "Jane@Example.com",
};

describe("contactValidation", () => {
  it("normalizes email/phone/country/whitespace", () => {
    const n = normalizeContact(contact);
    expect(n.firstName).toBe("Jane");
    expect(n.email).toBe("jane@example.com");
    expect(n.phone).toBe("+15551234567");
    expect(n.country).toBe("US");
  });
  it("rejects bad fields, naming only the FIELD (no PII value in the error)", () => {
    try {
      normalizeContact({ ...contact, phone: "12" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ContactValidationError);
      expect((e as ContactValidationError).message).toContain("phone");
      expect((e as ContactValidationError).message).not.toContain("12");
    }
    expect(() => normalizeContact({ ...contact, email: "nope" })).toThrow(ContactValidationError);
    expect(() => normalizeContact({ ...contact, country: "USA" })).toThrow(ContactValidationError);
    expect(() => normalizeContact({ ...contact, firstName: "" })).toThrow(ContactValidationError);
  });
  it("fails closed on unsupported TLD requirements", () => {
    const n = normalizeContact(contact);
    expect(() => assertContactMeetsTld(n, "com")).not.toThrow();
    expect(() => assertContactMeetsTld(n, "xyz")).toThrow(UnsupportedTldRequirementError);
    expect(() => assertContactMeetsTld(n, "us")).toThrow(UnsupportedTldRequirementError);
  });
});

describe("contactAuthPolicy", () => {
  it("members can never perform sensitive actions", () => {
    expect(authorizeDomainAction("purchase", { role: "member" }).allowed).toBe(false);
    expect(authorizeDomainAction("registrant_change", { role: "member" }).allowed).toBe(false);
    expect(authorizeDomainAction("view", { role: "member" }).allowed).toBe(true);
  });
  it("owner-sensitive actions are owner-only unless admin is explicitly granted", () => {
    expect(
      authorizeDomainAction("registrant_change", { role: "admin", reauthenticatedRecently: true }).allowed,
    ).toBe(false);
    expect(
      authorizeDomainAction("registrant_change", {
        role: "admin",
        ownerGrantedDomainAdmin: true,
        reauthenticatedRecently: true,
      }).allowed,
    ).toBe(true);
  });
  it("requires recent reauthentication for sensitive actions", () => {
    expect(requiresReauth("transfer")).toBe(true);
    expect(requiresReauth("view")).toBe(false);
    expect(authorizeDomainAction("purchase", { role: "owner" })).toEqual({
      allowed: false,
      reason: "reauth_required",
    });
    expect(
      authorizeDomainAction("purchase", { role: "owner", reauthenticatedRecently: true }).allowed,
    ).toBe(true);
  });
});

describe("DomainContactService", () => {
  const mk = () =>
    new DomainContactService(
      new DomainContactRepository(new EnvelopeCipher(keyring), new BlindIndex(keyring)),
    );
  const ownerAuth = { role: "owner" as const, reauthenticatedRecently: true };
  const base = {
    id: "c1",
    registrationId: "r1",
    role: "registrant" as const,
    tld: "com",
    contact,
    actorId: "u1",
    effectiveAt: "2026-01-01T00:00:00Z",
    accuracyConfirmed: true,
    authorizedConfirmed: true,
  };

  it("stores an encrypted, confirmed contact for an authorized owner", async () => {
    const svc = mk();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await svc.setContact(base, ownerAuth);
      const back = await svc.getContact("r1", "registrant");
      expect(back?.email).toBe("jane@example.com");
      const hist = await svc.history("r1", "registrant");
      expect(hist[0].contactCiphertext).toMatch(/^v1:1:/);
      expect(hist[0].contactCiphertext).not.toContain("Jane");
      expect(hist[0].accuracyConfirmed).toBe(true);
      expect(hist[0].authorizedConfirmed).toBe(true);
    });
  });
  it("denies a member", async () => {
    const svc = mk();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        svc.setContact(base, { role: "member" }),
      ).rejects.toBeInstanceOf(DomainContactAuthError);
    });
  });
  it("requires the accuracy + authorization confirmation", async () => {
    const svc = mk();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        svc.setContact({ ...base, accuracyConfirmed: false }, ownerAuth),
      ).rejects.toBeInstanceOf(ContactValidationError);
    });
  });
  it("fails closed on an unsupported TLD", async () => {
    const svc = mk();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      await expect(
        svc.setContact({ ...base, tld: "xyz" }, ownerAuth),
      ).rejects.toBeInstanceOf(UnsupportedTldRequirementError);
    });
  });
  it("is tenant-isolated", async () => {
    const svc = mk();
    await runWithTenant({ organizationId: "orgA" }, () => svc.setContact(base, ownerAuth));
    await runWithTenant({ organizationId: "orgB" }, async () => {
      expect(await svc.getContact("r1", "registrant")).toBeUndefined();
    });
  });
});
