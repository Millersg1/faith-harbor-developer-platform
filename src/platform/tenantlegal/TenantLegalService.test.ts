import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import {
  ImmutableLegalDocumentError,
  LegalMarkerError,
  LegalStateError,
} from "../legal/PlatformLegalService";
import { TenantLegalService } from "./TenantLegalService";

function svc() {
  return new TenantLegalService();
}

const FULL_PRIVACY = {
  legalName: "Acme LLC",
  publicName: "Acme",
  infoCollected: "Name and email address.",
  infoUse: "To provide our services.",
  privacyContact: "privacy@acme.example",
  website: "https://acme.example",
};

describe("TenantLegalService — tenant safety", () => {
  it("fails closed without a tenant context", async () => {
    await expect(svc().listAll()).rejects.toBeTruthy();
    await expect(
      svc().saveQuestionnaire({ legalName: "X" }),
    ).rejects.toBeTruthy();
  });

  it("isolates documents and questionnaires between tenants", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await s.saveQuestionnaire(FULL_PRIVACY);
      const g = await s.generateDraft("privacy");
      expect(g.document.version).toBe(1);
    });
    await runWithTenant({ organizationId: "org-b" }, async () => {
      expect(await s.listAll()).toHaveLength(0);
      expect((await s.getQuestionnaire()).answers).toEqual({});
    });
  });

  it("sanitizes questionnaire answers (drops unknown keys)", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      const v = await s.saveQuestionnaire({
        legalName: "  Acme LLC  ",
        notAField: "ignore me",
        infoCollected: "",
      });
      expect(v.answers.legalName).toBe("Acme LLC");
      expect(v.answers).not.toHaveProperty("notAField");
      expect(v.answers).not.toHaveProperty("infoCollected");
    });
  });
});

describe("TenantLegalService — generation & publication guard", () => {
  it("marks missing material facts and blocks publication", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await s.saveQuestionnaire({ legalName: "Acme LLC" }); // missing infoCollected/infoUse/privacyContact
      const { document, missingFacts } = await s.generateDraft("privacy");
      expect(missingFacts).toContain("infoCollected");
      expect(document.bodyMarkdown).toContain("TODO:");
      // Even after marking reviewed, the guard blocks a body with a TODO.
      await s.markReviewed(document.id);
      await expect(s.publish(document.id)).rejects.toBeInstanceOf(
        LegalMarkerError,
      );
    });
  });

  it("generates only from provided answers (no invented facts)", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await s.saveQuestionnaire(FULL_PRIVACY);
      const { document, missingFacts } = await s.generateDraft("privacy");
      expect(missingFacts).toHaveLength(0);
      expect(document.bodyMarkdown).not.toContain("TODO:");
      expect(document.bodyMarkdown).toContain("Acme LLC");
      expect(document.bodyMarkdown).toContain("Name and email address.");
      expect(document.bodyMarkdown).toContain("privacy@acme.example");
    });
  });

  it("requires human review before publishing", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await s.saveQuestionnaire(FULL_PRIVACY);
      const { document } = await s.generateDraft("privacy");
      await expect(s.publish(document.id)).rejects.toBeInstanceOf(
        LegalStateError,
      );
    });
  });
});

describe("TenantLegalService — lifecycle", () => {
  async function publishedPrivacy(s: TenantLegalService) {
    await s.saveQuestionnaire(FULL_PRIVACY);
    const { document } = await s.generateDraft("privacy");
    await s.markReviewed(document.id);
    return s.publish(document.id, { effectiveDate: "2026-08-01" });
  }

  it("publishes, is immutable, and supersedes on new version", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      const v1 = await publishedPrivacy(s);
      expect(v1.status).toBe("published");
      expect(v1.effectiveDate).toBe("2026-08-01");
      expect((await s.getPublished("privacy"))?.version).toBe(1);

      // Editing a published version is refused.
      await expect(
        s.updateDraft(v1.id, { bodyMarkdown: "tampered" }),
      ).rejects.toBeInstanceOf(ImmutableLegalDocumentError);

      // New version supersedes v1.
      const v2 = await s.createNewVersion("privacy");
      await s.updateDraft(v2.id, {
        bodyMarkdown: "## Privacy\n\nRevised, still by Acme LLC.",
      });
      await s.markReviewed(v2.id);
      await s.publish(v2.id);

      const versions = await s.listVersions("privacy");
      expect(versions.find((v) => v.version === 1)?.status).toBe(
        "superseded",
      );
      expect((await s.getPublished("privacy"))?.version).toBe(2);
    });
  });

  it("unpublishes (removed from public) and restores an old version as a draft", async () => {
    const s = svc();
    await runWithTenant({ organizationId: "org-a" }, async () => {
      const v1 = await publishedPrivacy(s);
      await s.unpublish(v1.id);
      expect(await s.getPublished("privacy")).toBeUndefined();

      const restored = await s.restoreAsDraft(v1.id);
      expect(restored.status).toBe("draft");
      expect(restored.version).toBe(2);
      expect(restored.bodyMarkdown).toBe(v1.bodyMarkdown);
    });
  });
});
