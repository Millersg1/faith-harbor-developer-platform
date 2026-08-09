import { describe, expect, it } from "vitest";

import type { FormLeadMagnet } from "../forms/PlatformForm";
import {
  LeadMagnetCapabilityRepository,
  LeadMagnetCapabilityService,
} from "./LeadMagnetCapabilityService";
import {
  LeadMagnetFulfillmentRepository,
  LeadMagnetFulfillmentService,
} from "./LeadMagnetFulfillmentService";

function harness(fileExists = true) {
  const repo = new LeadMagnetFulfillmentRepository();
  const capabilities = new LeadMagnetCapabilityService(
    new LeadMagnetCapabilityRepository(),
  );
  const svc = new LeadMagnetFulfillmentService(
    repo,
    capabilities,
    async () => fileExists,
  );
  return { repo, capabilities, svc };
}

const DOWNLOAD: FormLeadMagnet = { id: "m1", title: "Guide", mode: "download", fileId: "file1" };
const EMAIL: FormLeadMagnet = { id: "m1", title: "Guide", mode: "email", fileId: "file1", emailSubject: "Your guide" };
const REDIRECT: FormLeadMagnet = { id: "m1", title: "Guide", mode: "redirect", redirectUrl: "https://ex.com/g" };

const baseInput = { organizationId: "orgA", formId: "form1", submissionId: "sub1" };

describe("LeadMagnetFulfillmentService", () => {
  it("no configured magnet → null (nothing to fulfill)", async () => {
    const { svc } = harness();
    expect(await svc.fulfill({ ...baseInput, magnet: undefined })).toBeNull();
  });

  it("redirect mode binds the validated owner URL", async () => {
    const { svc } = harness();
    const r = await svc.fulfill({ ...baseInput, magnet: REDIRECT });
    expect(r).toMatchObject({ status: "ready", mode: "redirect", redirectUrl: "https://ex.com/g" });
  });

  it("an invalid configured redirect → needs_attention (never navigates)", async () => {
    const { svc } = harness();
    const r = await svc.fulfill({
      ...baseInput,
      magnet: { ...REDIRECT, redirectUrl: "javascript:alert(1)" },
    });
    expect(r).toMatchObject({ status: "needs_attention", mode: "redirect" });
  });

  it("download mode mints a capability token (opaque)", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    expect(r?.status).toBe("ready");
    expect(r && "capabilityToken" in r && r.capabilityToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("download/email with an unavailable file → needs_attention (no capability)", async () => {
    const { svc } = harness(false);
    const r = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    expect(r).toMatchObject({ status: "needs_attention", reason: "file_unavailable" });
  });

  it("email mode returns email_pending + token + recipient", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: EMAIL, recipientEmail: "lead@x.com" });
    expect(r).toMatchObject({ status: "email_pending", mode: "email", recipientEmail: "lead@x.com" });
    expect(r && "capabilityToken" in r && r.capabilityToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("email mode with no recipient → needs_attention", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: EMAIL });
    expect(r).toMatchObject({ status: "needs_attention", reason: "no_recipient" });
  });

  it("is idempotent per submission — a re-run mints no second capability, re-sends nothing", async () => {
    const { svc } = harness(true);
    const first = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    const firstToken = first && "capabilityToken" in first ? first.capabilityToken : undefined;
    expect(firstToken).toBeTruthy();
    const second = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    expect(second).toMatchObject({ status: "already_fulfilled", mode: "download" });
    // No new token in the idempotent response.
    expect(second && "capabilityToken" in second).toBe(false);
  });

  it("binds the OWNER config snapshot; the persisted record carries it (not client input)", async () => {
    const { svc, repo } = harness(true);
    await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    const rec = await repo.getBySubmission("sub1");
    expect(rec?.organizationId).toBe("orgA");
    expect(rec?.fileId).toBe("file1"); // from owner config
    expect(rec?.mode).toBe("download");
  });
});
