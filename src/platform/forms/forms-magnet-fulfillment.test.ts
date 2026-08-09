import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformLeadRepository } from "../crm/PlatformLeadRepository";
import { PlatformLeadService } from "../crm/PlatformLeadService";
import {
  EmailSuppressionRepository,
  EmailSuppressionService,
} from "../marketing/EmailSuppressionService";
import {
  MarketingActivationRepository,
  MarketingActivationService,
} from "../marketing/MarketingActivationService";
import {
  MarketingConsentRepository,
  MarketingConsentService,
} from "../marketing/MarketingConsentService";
import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "../magnet/LeadMagnetCapabilityService";
import {
  LeadMagnetDispatchRepository,
  LeadMagnetDispatchService,
} from "../magnet/LeadMagnetDispatchService";
import {
  LeadMagnetFulfillmentRepository,
  LeadMagnetFulfillmentService,
} from "../magnet/LeadMagnetFulfillmentService";
import type { FormLeadMagnet } from "./PlatformForm";
import { PlatformFormRepository } from "./PlatformFormRepository";
import { PlatformFormService } from "./PlatformFormService";

const ORG = "orgA";
const CTX = { canonicalBase: "https://acme.allelitecloud.com" };
const FIELDS = [
  { key: "email", type: "email" as const, label: "Email", required: true },
];

function build() {
  const leads = new PlatformLeadService(new PlatformLeadRepository());
  const capabilities = new LeadMagnetCapabilityService(new LeadMagnetCapabilityRepository());
  const fulfillmentRepo = new LeadMagnetFulfillmentRepository();
  const magnetFulfillment = new LeadMagnetFulfillmentService(
    fulfillmentRepo,
    capabilities,
    async (id) => id === "file1", // only the owner-configured file is eligible
  );
  const dispatchRepo = new LeadMagnetDispatchRepository();
  const magnetDispatch = new LeadMagnetDispatchService(dispatchRepo);
  const suppression = new EmailSuppressionService(new EmailSuppressionRepository());
  const consent = new MarketingConsentService(new MarketingConsentRepository());
  const activationRepo = new MarketingActivationRepository();
  const activations = new MarketingActivationService(activationRepo);
  const forms = new PlatformFormService(new PlatformFormRepository(), {
    leads,
    magnetFulfillment,
    magnetDispatch,
    suppression,
    consent,
    activations,
  });
  return { forms, leads, capabilities, fulfillmentRepo, magnetDispatch, dispatchRepo, suppression, activationRepo };
}

async function makeForm(forms: PlatformFormService, magnet: FormLeadMagnet) {
  return runWithTenant({ organizationId: ORG }, () =>
    forms.create({
      name: "Guide form",
      fields: FIELDS,
      createLead: true,
      settings: { leadMagnet: magnet },
    } as Parameters<PlatformFormService["create"]>[0]),
  );
}

async function dispatchRows(repo: LeadMagnetDispatchRepository) {
  return repo.claimDue(
    "peek",
    new Date(Date.now() + 5_000).toISOString(),
    new Date(Date.now() + 65_000).toISOString(),
    50,
  );
}

const DOWNLOAD: FormLeadMagnet = { id: "m1", title: "Guide", mode: "download", fileId: "file1" };
const EMAIL: FormLeadMagnet = { id: "m1", title: "Guide", mode: "email", fileId: "file1", emailSubject: "Your guide" };
const REDIRECT: FormLeadMagnet = { id: "m1", title: "Guide", mode: "redirect", redirectUrl: "https://ex.com/g" };

describe("submission → lead-magnet fulfillment (all modes, marketing-independent)", () => {
  it("download mode → nextAction download URL (fragment token) + lead created", async () => {
    const { forms, leads, fulfillmentRepo } = build();
    const form = await makeForm(forms, DOWNLOAD);
    const res = await forms.submitPublic(form.slug, { email: "lead@x.com" }, undefined, CTX);
    expect(res.nextAction?.type).toBe("download");
    expect(res.nextAction?.url).toMatch(/^https:\/\/acme\.allelitecloud\.com\/magnet#d=[a-f0-9]{64}$/);
    // Immutable fulfillment recorded; lead created.
    expect(await fulfillmentRepo.listForOrg(ORG)).toHaveLength(1);
    expect(await runWithTenant({ organizationId: ORG }, () => leads.findByEmail("lead@x.com"))).toBeTruthy();
  });

  it("redirect mode → nextAction redirect to the validated owner URL", async () => {
    const { forms } = build();
    const form = await makeForm(forms, REDIRECT);
    const res = await forms.submitPublic(form.slug, { email: "lead@x.com" }, undefined, CTX);
    expect(res.nextAction).toEqual({ type: "redirect", url: "https://ex.com/g" });
  });

  it("email mode → dispatch enqueued, generic nextAction (never reveals SMTP/address)", async () => {
    const { forms, magnetDispatch, dispatchRepo } = build();
    const form = await makeForm(forms, EMAIL);
    const res = await forms.submitPublic(form.slug, { email: "lead@x.com" }, undefined, CTX);
    expect(res.nextAction).toEqual({ type: "none" });
    const rows = await dispatchRows(dispatchRepo);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("lead@x.com");
    expect(rows[0].fileId).toBe("file1");
    void magnetDispatch;
  });

  it("magnet is fulfilled WITHOUT marketing consent and creates NO marketing enrollment", async () => {
    const { forms, activationRepo, fulfillmentRepo } = build();
    const form = await makeForm(forms, DOWNLOAD); // no consent config on the form
    await forms.submitPublic(form.slug, { email: "lead@x.com" }, undefined, CTX);
    expect(await fulfillmentRepo.listForOrg(ORG)).toHaveLength(1); // fulfilled
    // No activation/enrollment created.
    expect(await activationRepo.findByTerms(ORG, form.id, "lead@x.com", null)).toBeUndefined();
  });

  it("a tenant MARKETING unsubscribe does NOT block a requested transactional magnet email", async () => {
    const { forms, dispatchRepo, suppression } = build();
    const form = await makeForm(forms, EMAIL);
    await suppression.suppressTenant(ORG, "lead@x.com"); // unsubscribed from marketing
    await forms.submitPublic(form.slug, { email: "lead@x.com" }, undefined, CTX);
    expect(await dispatchRows(dispatchRepo)).toHaveLength(1); // magnet still sent
  });

  it("GLOBAL suppression blocks the email safely (no dispatch), lead + fulfillment intact, generic reply", async () => {
    const { forms, dispatchRepo, fulfillmentRepo, leads, suppression } = build();
    const form = await makeForm(forms, EMAIL);
    await suppression.suppressGlobal("lead@x.com", "hard_bounce");
    const res = await forms.submitPublic(form.slug, { email: "lead@x.com" }, undefined, CTX);
    expect(res.nextAction).toEqual({ type: "none" }); // generic
    expect(await dispatchRows(dispatchRepo)).toHaveLength(0); // email blocked
    // Lead + fulfillment history preserved.
    expect(await fulfillmentRepo.listForOrg(ORG)).toHaveLength(1);
    expect(await runWithTenant({ organizationId: ORG }, () => leads.findByEmail("lead@x.com"))).toBeTruthy();
  });

  it("ignores client-supplied mode/file/redirect/org — only the owner config is used", async () => {
    const { forms, dispatchRepo } = build();
    const form = await makeForm(forms, EMAIL); // owner config: email + file1
    // The client tries to override via data/meta — all ignored (submitPublic only
    // reads form.settings.leadMagnet; the data is filtered to known fields).
    await forms.submitPublic(
      form.slug,
      { email: "lead@x.com", mode: "redirect", fileId: "evil", redirectUrl: "https://evil.com", organizationId: "orgB" },
      undefined,
      CTX,
    );
    const rows = await dispatchRows(dispatchRepo);
    expect(rows).toHaveLength(1);
    expect(rows[0].fileId).toBe("file1"); // owner's file, not "evil"
    expect(rows[0].organizationId).toBe(ORG); // owner's org, not "orgB"
  });

  it("rejects an unsafe redirect config at SAVE time (owner/admin validation)", async () => {
    const { forms } = build();
    await expect(makeForm(forms, { ...REDIRECT, redirectUrl: "javascript:alert(1)" })).rejects.toThrow(
      /https/i,
    );
  });

  it("rejects a download/email magnet with no selected file at save time", async () => {
    const { forms } = build();
    await expect(
      makeForm(forms, { id: "m1", title: "Guide", mode: "download" }),
    ).rejects.toThrow(/PDF file/i);
  });
});
