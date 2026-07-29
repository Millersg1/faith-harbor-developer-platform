import { describe, expect, it } from "vitest";

import {
  ImmutableLegalDocumentError,
  PlatformLegalService,
  type LegalAuditEvent,
} from "./PlatformLegalService";
import { platformLegalSeeds } from "./content/platformLegalContent";

function service(events?: LegalAuditEvent[]) {
  return new PlatformLegalService(undefined, {
    audit: events ? (e) => events.push(e) : undefined,
  });
}

describe("PlatformLegalService — versioning & immutability", () => {
  it("assigns incrementing versions per kind", async () => {
    const svc = service();
    const v1 = await svc.createDraft({
      kind: "privacy",
      title: "Privacy Policy",
      summary: "s",
      bodyMarkdown: "## A\n\nbody",
    });
    const v2 = await svc.createDraft({
      kind: "privacy",
      title: "Privacy Policy",
      summary: "s",
      bodyMarkdown: "## A\n\nbody 2",
    });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
  });

  it("refuses to edit a published version (immutable)", async () => {
    const svc = service();
    const draft = await svc.createDraft({
      kind: "cookies",
      title: "Cookie Policy",
      summary: "s",
      bodyMarkdown: "body",
    });
    await svc.publish(draft.id);
    await expect(
      svc.updateDraft(draft.id, { bodyMarkdown: "tampered" }),
    ).rejects.toBeInstanceOf(ImmutableLegalDocumentError);
  });

  it("publishing a new version supersedes the previous published one", async () => {
    const svc = service();
    const d1 = await svc.createDraft({
      kind: "terms",
      title: "Terms",
      summary: "s",
      bodyMarkdown: "v1 body",
    });
    await svc.publish(d1.id);

    const d2 = await svc.createNewVersion("terms");
    await svc.updateDraft(d2.id, { bodyMarkdown: "v2 body" });
    await svc.publish(d2.id);

    const live = await svc.getPublished("terms");
    expect(live?.version).toBe(2);
    expect(live?.bodyMarkdown).toBe("v2 body");

    const versions = await svc.listVersions("terms");
    const v1 = versions.find((v) => v.version === 1);
    // History is preserved, superseded, and NOT rewritten.
    expect(v1?.status).toBe("superseded");
    expect(v1?.bodyMarkdown).toBe("v1 body");
  });

  it("emits audit events without document bodies or PII", async () => {
    const events: LegalAuditEvent[] = [];
    const svc = service(events);
    const d = await svc.createDraft({
      kind: "accessibility",
      title: "Accessibility",
      summary: "s",
      bodyMarkdown: "secret body text",
    });
    await svc.publish(d.id);
    expect(events.map((e) => e.action)).toEqual([
      "document.created",
      "document.published",
    ]);
    for (const e of events) {
      expect(JSON.stringify(e)).not.toContain("secret body text");
    }
  });
});

describe("PlatformLegalService — seeding", () => {
  it("seeds each kind once and is idempotent", async () => {
    const svc = service();
    await svc.seedIfEmpty(platformLegalSeeds());
    await svc.seedIfEmpty(platformLegalSeeds()); // second run must be a no-op

    // Exactly one version per seeded kind.
    const privacy = await svc.listVersions("privacy");
    expect(privacy).toHaveLength(1);

    // Safe docs are published; owner-dependent docs remain drafts.
    expect((await svc.getPublished("cookies"))?.version).toBe(1);
    expect((await svc.getPublished("ai-policy"))?.version).toBe(1);
    expect(await svc.getPublished("terms")).toBeUndefined();
    expect(await svc.getPublished("privacy")).toBeUndefined();
    expect(await svc.getPublished("subprocessors")).toBeUndefined();
  });

  it("does not overwrite an existing draft on reseed", async () => {
    const svc = service();
    await svc.createDraft({
      kind: "cookies",
      title: "Custom Cookie Policy",
      summary: "s",
      bodyMarkdown: "owner-authored",
    });
    await svc.seedIfEmpty(platformLegalSeeds());
    const versions = await svc.listVersions("cookies");
    expect(versions).toHaveLength(1);
    expect(versions[0].title).toBe("Custom Cookie Policy");
  });
});
