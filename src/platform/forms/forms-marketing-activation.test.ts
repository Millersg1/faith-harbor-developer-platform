import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
import {
  MarketingConsentRepository,
  MarketingConsentService,
} from "../marketing/MarketingConsentService";
import {
  MarketingActivationRepository,
  MarketingActivationService,
} from "../marketing/MarketingActivationService";
import {
  ConfirmationDispatchRepository,
  ConfirmationDispatchService,
} from "../marketing/ConfirmationDispatchService";
import { PlatformFormRepository } from "./PlatformFormRepository";
import { PlatformFormService } from "./PlatformFormService";
import type { FormConsentConfig } from "./PlatformForm";

const FIELDS = [
  { key: "email", type: "email" as const, label: "Email", required: true },
  { key: "optin", type: "consent" as const, label: "Email me", required: false },
];

function build() {
  const leads = new PlatformLeadService(new PlatformLeadRepository());
  const consent = new MarketingConsentService(new MarketingConsentRepository());
  const activationRepo = new MarketingActivationRepository();
  const activations = new MarketingActivationService(activationRepo);
  const dispatchRepo = new ConfirmationDispatchRepository();
  const confirmationDispatch = new ConfirmationDispatchService(dispatchRepo);
  const forms = new PlatformFormService(new PlatformFormRepository(), {
    leads,
    consent,
    activations,
    confirmationDispatch,
  });
  return { forms, leads, consent, activations, activationRepo, dispatchRepo };
}

async function makeForm(
  forms: PlatformFormService,
  org: string,
  consent: Partial<FormConsentConfig> & { enabled: boolean; fieldKey: string },
) {
  return runWithTenant({ organizationId: org }, () =>
    forms.create({
      name: "Newsletter",
      fields: FIELDS,
      createLead: true,
      settings: {
        consent: {
          wording: "I agree to receive marketing emails.",
          version: "v1",
          ...consent,
        },
      },
    } as Parameters<PlatformFormService["create"]>[0]),
  );
}

/** Peek at the (queued) dispatch rows by leasing them. */
async function dispatchRows(repo: ConfirmationDispatchRepository) {
  return repo.claimDue(
    "test",
    new Date(Date.now() + 10_000).toISOString(),
    new Date(Date.now() + 70_000).toISOString(),
    50,
  );
}

describe("public submission → marketing activation + confirmation dispatch", () => {
  it("forces double opt-in for a no-Origin submission: awaiting activation + enqueued dispatch, lead still created", async () => {
    const { forms, leads, activationRepo, dispatchRepo } = build();
    const form = await makeForm(forms, "orgA", {
      enabled: true,
      fieldKey: "optin",
      doubleOptIn: false, // tenant prefers single — but no Origin FORCES double
      sequenceId: "seq-1",
    });

    const res = await forms.submitPublic(
      form.slug,
      { email: "lead@x.com", optin: true },
      undefined,
      { canonicalBase: "https://orga.allelitecloud.com" }, // NO origin → untrusted
    );
    expect(res.confirmationMessage).toBeTruthy(); // enumeration-safe generic reply

    const act = await activationRepo.findByTerms("orgA", form.id, "lead@x.com", "v1");
    expect(act?.status).toBe("awaiting_confirmation");
    expect(act?.organizationId).toBe("orgA"); // tenant isolation
    expect(act?.doubleOptIn).toBe(true); // forced

    const dispatched = await dispatchRows(dispatchRepo);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].email).toBe("lead@x.com");
    expect(dispatched[0].confirmBase).toBe("https://orga.allelitecloud.com");

    // Lead independence: the CRM lead exists regardless of the marketing path.
    const lead = await runWithTenant({ organizationId: "orgA" }, () =>
      leads.findByEmail("lead@x.com"),
    );
    expect(lead).toBeTruthy();
  });

  it("honors single opt-in for a trustworthy allowlisted Origin: ready activation, NO dispatch", async () => {
    const { forms, activationRepo, dispatchRepo } = build();
    const form = await makeForm(forms, "orgA", {
      enabled: true,
      fieldKey: "optin",
      doubleOptIn: false,
      sequenceId: "seq-1",
    });

    await forms.submitPublic(
      form.slug,
      { email: "lead@x.com", optin: true },
      undefined,
      {
        origin: "https://partner.example",
        originAllowlisted: true, // trustworthy browser origin
        canonicalBase: "https://orga.allelitecloud.com",
      },
    );

    const act = await activationRepo.findByTerms("orgA", form.id, "lead@x.com", "v1");
    expect(act?.status).toBe("ready"); // single opt-in → immediately ready
    expect(await dispatchRows(dispatchRepo)).toHaveLength(0); // no confirmation email
  });

  it("with no target sequence configured: consent + lead only, NO activation/dispatch", async () => {
    const { forms, leads, consent, activationRepo, dispatchRepo } = build();
    const form = await makeForm(forms, "orgA", {
      enabled: true,
      fieldKey: "optin",
      // no sequenceId
    });
    await forms.submitPublic(
      form.slug,
      { email: "lead@x.com", optin: true },
      undefined,
      { canonicalBase: "https://orga.allelitecloud.com" },
    );
    expect(
      await activationRepo.findByTerms("orgA", form.id, "lead@x.com", "v1"),
    ).toBeUndefined();
    expect(await dispatchRows(dispatchRepo)).toHaveLength(0);
    // But consent + lead still recorded.
    const c = await runWithTenant({ organizationId: "orgA" }, () =>
      consent.latestForEmail("lead@x.com"),
    );
    expect(c?.granted).toBe(true);
    const lead = await runWithTenant({ organizationId: "orgA" }, () =>
      leads.findByEmail("lead@x.com"),
    );
    expect(lead).toBeTruthy();
  });

  it("no marketing activation when the consent box is not affirmatively checked", async () => {
    const { forms, activationRepo, dispatchRepo } = build();
    const form = await makeForm(forms, "orgA", {
      enabled: true,
      fieldKey: "optin",
      sequenceId: "seq-1",
    });
    await forms.submitPublic(
      form.slug,
      { email: "lead@x.com", optin: false }, // not consented
      undefined,
      { canonicalBase: "https://orga.allelitecloud.com" },
    );
    expect(
      await activationRepo.findByTerms("orgA", form.id, "lead@x.com", "v1"),
    ).toBeUndefined();
    expect(await dispatchRows(dispatchRepo)).toHaveLength(0);
  });

  it("bound confirmation flips the activation awaiting→ready for the EXACT terms", async () => {
    const { forms, activations, activationRepo } = build();
    const form = await makeForm(forms, "orgA", {
      enabled: true,
      fieldKey: "optin",
      doubleOptIn: true,
      sequenceId: "seq-1",
    });
    await forms.submitPublic(
      form.slug,
      { email: "lead@x.com", optin: true },
      undefined,
      { canonicalBase: "https://orga.allelitecloud.com" },
    );
    // This is exactly what the /marketing/confirm route calls after the token
    // is validated (bound by org, formId, email, version).
    await runWithTenant({ organizationId: "orgA" }, () =>
      activations.confirm("orgA", "lead@x.com", "v1", form.id),
    );
    const act = await activationRepo.findByTerms("orgA", form.id, "lead@x.com", "v1");
    expect(act?.status).toBe("ready");
    expect(act?.confirmedAt).toBeTruthy();
    // A confirm for a DIFFERENT version does not ready this intent.
    const wrong = await runWithTenant({ organizationId: "orgA" }, () =>
      activations.confirm("orgA", "lead@x.com", "v-other", form.id),
    );
    expect(wrong).toBeUndefined();
  });

  it("a repeat submission does not create a duplicate activation or dispatch", async () => {
    const { forms, activationRepo, dispatchRepo } = build();
    const form = await makeForm(forms, "orgA", {
      enabled: true,
      fieldKey: "optin",
      doubleOptIn: true,
      sequenceId: "seq-1",
    });
    const ctx = { canonicalBase: "https://orga.allelitecloud.com" };
    await forms.submitPublic(form.slug, { email: "lead@x.com", optin: true }, undefined, ctx);
    await forms.submitPublic(form.slug, { email: "lead@x.com", optin: true }, undefined, ctx);
    // findByTerms returns a single intent; dispatch is idempotent per activation.
    expect(
      (await activationRepo.findByTerms("orgA", form.id, "lead@x.com", "v1"))?.status,
    ).toBe("awaiting_confirmation");
    expect(await dispatchRows(dispatchRepo)).toHaveLength(1);
  });
});
