import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformLegalService } from "./PlatformLegalService";
import { LegalAcceptanceService } from "./LegalAcceptanceService";
import { LegalAcceptanceRepository } from "./LegalAcceptanceRepository";

async function publishedLegal() {
  const legal = new PlatformLegalService();
  const t = await legal.createDraft({
    kind: "terms",
    title: "Terms of Service",
    summary: "s",
    bodyMarkdown: "terms v1",
  });
  await legal.publish(t.id);
  const p = await legal.createDraft({
    kind: "privacy",
    title: "Privacy Policy",
    summary: "s",
    bodyMarkdown: "privacy v1",
  });
  await legal.publish(p.id);
  return legal;
}

describe("LegalAcceptanceService", () => {
  it("records the exact published versions accepted", async () => {
    const legal = await publishedLegal();
    const svc = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    await runWithTenant({ organizationId: "org-a" }, async () => {
      const rows = await svc.recordAcceptance({
        userId: "u1",
        source: "signup",
      });
      expect(rows).toHaveLength(2);
      const list = await svc.listForUser("u1");
      const kinds = list
        .map((r) => `${r.documentKind}:${r.documentVersion}`)
        .sort();
      expect(kinds).toEqual(["privacy:1", "terms:1"]);
      expect(list[0].source).toBe("signup");
    });
  });

  it("does not rewrite historical acceptance when a new version publishes", async () => {
    const legal = await publishedLegal();
    const svc = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await svc.recordAcceptance({ userId: "u1", source: "signup" });
    });
    // Publish Terms v2 AFTER the user accepted v1.
    const v2 = await legal.createNewVersion("terms");
    await legal.updateDraft(v2.id, { bodyMarkdown: "terms v2" });
    await legal.publish(v2.id);

    await runWithTenant({ organizationId: "org-a" }, async () => {
      const list = await svc.listForUser("u1");
      const terms = list.filter((r) => r.documentKind === "terms");
      // The historical row still records v1 — never rewritten to v2.
      expect(terms).toHaveLength(1);
      expect(terms[0].documentVersion).toBe(1);
    });
  });

  it("requires re-consent only when a version is explicitly marked", async () => {
    const legal = await publishedLegal();
    const svc = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await svc.recordAcceptance({ userId: "u1", source: "signup" });
      // No version requires reconsent yet.
      expect(await svc.pendingReconsent("u1")).toHaveLength(0);
    });

    // Publish Terms v2 flagged as requiring re-consent.
    const v2 = await legal.createNewVersion("terms");
    await legal.updateDraft(v2.id, {
      bodyMarkdown: "terms v2",
      requiresReconsent: true,
    });
    await legal.publish(v2.id);

    await runWithTenant({ organizationId: "org-a" }, async () => {
      const pending = await svc.pendingReconsent("u1");
      expect(pending.map((p) => p.kind)).toEqual(["terms"]);
      expect(pending[0].version).toBe(2);
      // Accepting clears it.
      await svc.recordAcceptance({ userId: "u1", source: "reconsent" });
      expect(await svc.pendingReconsent("u1")).toHaveLength(0);
    });
  });

  it("isolates acceptance history between tenants", async () => {
    const legal = await publishedLegal();
    const svc = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    await runWithTenant({ organizationId: "org-a" }, async () => {
      await svc.recordAcceptance({ userId: "u1", source: "signup" });
    });
    // A different tenant sees nothing for the same user id.
    await runWithTenant({ organizationId: "org-b" }, async () => {
      expect(await svc.listForUser("u1")).toHaveLength(0);
    });
  });

  it("fails closed when called without a tenant context", async () => {
    const legal = await publishedLegal();
    const svc = new LegalAcceptanceService(
      new LegalAcceptanceRepository(),
      legal,
    );
    await expect(
      svc.recordAcceptance({ userId: "u1", source: "signup" }),
    ).rejects.toBeTruthy();
  });
});
