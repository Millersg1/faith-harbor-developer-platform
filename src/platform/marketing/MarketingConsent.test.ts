import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
import { PlatformFormRepository } from "../forms/PlatformFormRepository";
import { PlatformFormService } from "../forms/PlatformFormService";
import {
  MarketingConsentRepository,
  MarketingConsentService,
} from "./MarketingConsentService";

const FIELDS = [
  { key: "name", type: "text" as const, label: "Name", required: true },
  { key: "email", type: "email" as const, label: "Email", required: true },
  {
    key: "optin",
    type: "consent" as const,
    label: "Email me marketing updates",
    required: false,
  },
];

const CONSENT = {
  enabled: true,
  fieldKey: "optin",
  wording: "Email me marketing updates from the Institute.",
  version: "2026-01",
};

function build() {
  const consentRepo = new MarketingConsentRepository();
  const consent = new MarketingConsentService(consentRepo);
  const clients = new PlatformClientService(new PlatformClientRepository());
  const leads = new PlatformLeadService(new PlatformLeadRepository(), clients);
  const forms = new PlatformFormService(new PlatformFormRepository(), {
    leads,
    consent,
  });
  return { forms, leads, consent };
}

describe("MarketingConsentService", () => {
  it("single opt-in is confirmed immediately; double opt-in stays pending", async () => {
    const svc = new MarketingConsentService(new MarketingConsentRepository());
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const single = await svc.record({
        email: "a@x.com",
        wording: "w",
        version: "1",
      });
      expect(single.confirmedAt).toBeTruthy();
      expect(await svc.hasConfirmedConsent("a@x.com")).toBe(true);

      const dbl = await svc.record({
        email: "b@x.com",
        wording: "w",
        version: "1",
        doubleOptIn: true,
      });
      expect(dbl.confirmedAt).toBeNull();
      expect(await svc.hasConfirmedConsent("b@x.com")).toBe(false);
      await svc.confirm(dbl.id, "2026-01-01T00:00:00.000Z");
      expect(await svc.hasConfirmedConsent("b@x.com")).toBe(true);
    });
  });

  it("is tenant-scoped — consent in one org is invisible to another", async () => {
    const svc = new MarketingConsentService(new MarketingConsentRepository());
    await runWithTenant({ organizationId: "orgA" }, () =>
      svc.record({ email: "shared@x.com", wording: "w", version: "1" }),
    );
    await runWithTenant({ organizationId: "orgB" }, async () => {
      expect(await svc.hasConfirmedConsent("shared@x.com")).toBe(false);
    });
  });
});

describe("public form → consent capture (separate from lead)", () => {
  it("records consent (double-opt-in pending) when the opt-in box is checked", async () => {
    const { forms, leads, consent } = build();
    let slug = "";
    await runWithTenant({ organizationId: "orgA" }, async () => {
      slug = (
        await forms.create({ name: "Guide", fields: FIELDS, settings: { consent: CONSENT } })
      ).slug;
    });
    await forms.submitPublic(slug, {
      name: "Dana",
      email: "dana@x.com",
      optin: true,
    });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      // The CRM lead exists…
      expect(await leads.list()).toHaveLength(1);
      // …and consent is RECORDED with exact wording/version, pending double-opt-in.
      const c = await consent.latestForEmail("dana@x.com");
      expect(c?.granted).toBe(true);
      expect(c?.wording).toBe(CONSENT.wording);
      expect(c?.version).toBe(CONSENT.version);
      expect(c?.formId).toBeTruthy();
      // Default double-opt-in ON → not yet confirmed → not marketing-eligible.
      expect(c?.confirmedAt).toBeNull();
      expect(await consent.hasConfirmedConsent("dana@x.com")).toBe(false);
    });
  });

  it("records NO consent when the opt-in box is absent/false (lead still created)", async () => {
    const { forms, leads, consent } = build();
    let slug = "";
    await runWithTenant({ organizationId: "orgA" }, async () => {
      slug = (
        await forms.create({ name: "Guide", fields: FIELDS, settings: { consent: CONSENT } })
      ).slug;
    });
    await forms.submitPublic(slug, { name: "Ida", email: "ida@x.com" });
    await runWithTenant({ organizationId: "orgA" }, async () => {
      expect(await leads.list()).toHaveLength(1); // lead created…
      expect(await consent.latestForEmail("ida@x.com")).toBeUndefined(); // …no consent
    });
  });

  it("duplicate submissions do not create duplicate consent", async () => {
    const { forms, consent } = build();
    let slug = "";
    await runWithTenant({ organizationId: "orgA" }, async () => {
      slug = (
        await forms.create({ name: "Guide", fields: FIELDS, settings: { consent: CONSENT } })
      ).slug;
    });
    const submit = () =>
      forms.submitPublic(slug, { name: "Dee", email: "dee@x.com", optin: true });
    await submit();
    await submit();
    await runWithTenant({ organizationId: "orgA" }, async () => {
      // Only ONE consent record despite two consenting submissions.
      expect(await consent.countForEmail("dee@x.com")).toBe(1);
    });
  });
});
