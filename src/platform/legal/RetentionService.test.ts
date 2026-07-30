import { describe, expect, it } from "vitest";

import {
  RetentionService,
  type PurgeableFile,
  type RetentionAuditEvent,
} from "./RetentionService";

function fixedNow(iso: string) {
  return () => iso;
}

describe("RetentionService.purgeDeletedFiles", () => {
  it("purges bytes and rows and audits per org with counts only", async () => {
    const files: PurgeableFile[] = [
      { id: "f1", organizationId: "org-a", storedKey: "org-a/k1" },
      { id: "f2", organizationId: "org-a", storedKey: "org-a/k2" },
      { id: "f3", organizationId: "org-b", storedKey: "org-b/k3" },
    ];
    const bytes: string[] = [];
    const rows: string[] = [];
    const audits: RetentionAuditEvent[] = [];

    const svc = new RetentionService({
      now: fixedNow("2026-07-29T00:00:00.000Z"),
      listPurgeableFiles: async () => files,
      deleteFileBytes: async (k) => {
        bytes.push(k);
      },
      deleteFileRow: async (id) => {
        rows.push(id);
      },
      isOrgOnLegalHold: async () => false,
      audit: (e) => {
        audits.push(e);
      },
    });

    const result = await svc.purgeDeletedFiles(30);
    expect(result.purgedFiles).toBe(3);
    expect(result.purgedOrgs).toBe(2);
    expect(bytes.sort()).toEqual(["org-a/k1", "org-a/k2", "org-b/k3"]);
    expect(rows.sort()).toEqual(["f1", "f2", "f3"]);
    // One audit per org, count only, no file identifiers.
    const a = audits.find((x) => x.organizationId === "org-a");
    expect(a?.count).toBe(2);
    expect(JSON.stringify(audits)).not.toContain("k1");
  });

  it("skips an organization under a legal hold entirely", async () => {
    const files: PurgeableFile[] = [
      { id: "f1", organizationId: "held", storedKey: "held/k1" },
      { id: "f2", organizationId: "ok", storedKey: "ok/k2" },
    ];
    const rows: string[] = [];
    const svc = new RetentionService({
      listPurgeableFiles: async () => files,
      deleteFileBytes: async () => {},
      deleteFileRow: async (id) => {
        rows.push(id);
      },
      isOrgOnLegalHold: async (org) => org === "held",
    });
    const result = await svc.purgeDeletedFiles(30);
    expect(result.purgedFiles).toBe(1);
    expect(result.skippedHeldOrgs).toBe(1);
    // The held org's row is never deleted.
    expect(rows).toEqual(["f2"]);
  });

  it("passes a cutoff older than now by the retention window", async () => {
    let capturedCutoff = "";
    const svc = new RetentionService({
      now: fixedNow("2026-07-29T00:00:00.000Z"),
      listPurgeableFiles: async (cutoff) => {
        capturedCutoff = cutoff;
        return [];
      },
      deleteFileBytes: async () => {},
      deleteFileRow: async () => {},
      isOrgOnLegalHold: async () => false,
    });
    await svc.purgeDeletedFiles(30);
    // 30 days before 2026-07-29 is 2026-06-29.
    expect(capturedCutoff.slice(0, 10)).toBe("2026-06-29");
  });
});
