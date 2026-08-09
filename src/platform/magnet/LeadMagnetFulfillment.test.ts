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

  it("download mode is ready but mints NO capability at fulfillment time", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    expect(r).toMatchObject({ status: "ready", mode: "download" });
    expect(r && "capabilityToken" in r).toBe(false); // minted at response time
  });

  it("issueDownloadCapability mints an opaque token at RESPONSE time (bounded siblings on retry)", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    const fid = (r && "fulfillmentId" in r && r.fulfillmentId) || "";
    const t1 = await svc.issueDownloadCapability(fid, "orgA");
    expect(t1).toMatch(/^[a-f0-9]{64}$/);
    // A lost-response retry mints a bounded replacement sibling (a new token).
    const t2 = await svc.issueDownloadCapability(fid, "orgA");
    expect(t2).toMatch(/^[a-f0-9]{64}$/);
    expect(t2).not.toBe(t1);
    // Cross-tenant issuance is refused.
    expect(await svc.issueDownloadCapability(fid, "orgB")).toBeNull();
  });

  it("download/email with an unavailable file → needs_attention (no capability)", async () => {
    const { svc } = harness(false);
    const r = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    expect(r).toMatchObject({ status: "needs_attention", reason: "file_unavailable" });
  });

  it("email mode returns email_pending + recipient (NO token — the worker mints per attempt)", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: EMAIL, recipientEmail: "lead@x.com" });
    expect(r).toMatchObject({ status: "email_pending", mode: "email", recipientEmail: "lead@x.com", fileId: "file1" });
    expect(r && "capabilityToken" in r).toBe(false);
  });

  it("email mode with no recipient → needs_attention", async () => {
    const { svc } = harness(true);
    const r = await svc.fulfill({ ...baseInput, magnet: EMAIL });
    expect(r).toMatchObject({ status: "needs_attention", reason: "no_recipient" });
  });

  it("is idempotent per submission — a re-run creates no second fulfillment", async () => {
    const { svc, repo } = harness(true);
    await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    const second = await svc.fulfill({ ...baseInput, magnet: DOWNLOAD });
    expect(second).toMatchObject({ status: "already_fulfilled", mode: "download" });
    const all = await repo.listForOrg("orgA");
    expect(all.filter((f) => f.submissionId === "sub1")).toHaveLength(1);
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
