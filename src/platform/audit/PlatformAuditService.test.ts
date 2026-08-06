import { describe, expect, it } from "vitest";

import { PlatformAuditRepository } from "./PlatformAuditRepository";
import { PlatformAuditService } from "./PlatformAuditService";

describe("PlatformAuditService — durable, tenant-neutral, no PII", () => {
  it("persists events and lists them newest-first (durable + queryable)", async () => {
    let t = 1_000;
    const svc = new PlatformAuditService(
      new PlatformAuditRepository(),
      () => t,
    );
    await svc.record({
      action: "privacy_request.status_changed",
      actorId: "admin-1",
      targetType: "privacy_request",
      targetId: "req-1",
      metadata: { newStatus: "in_review", category: "deletion" },
    });
    t = 2_000;
    await svc.record({
      action: "privacy_request.note_added",
      actorId: "admin-1",
      targetType: "privacy_request",
      targetId: "req-1",
      metadata: { visibility: "internal", noteId: "n-1" },
    });
    const all = await svc.list();
    expect(all).toHaveLength(2);
    expect(all[0].action).toBe("privacy_request.note_added"); // newest first

    const forTarget = await svc.listForTarget("privacy_request", "req-1");
    expect(forTarget).toHaveLength(2);
    const other = await svc.listForTarget("privacy_request", "nope");
    expect(other).toHaveLength(0);
  });

  it("carries only compact enums/ids — never names, emails, notes, or tokens", async () => {
    const svc = new PlatformAuditService(new PlatformAuditRepository());
    await svc.record({
      action: "privacy_request.status_changed",
      actorId: "admin-9",
      targetType: "privacy_request",
      targetId: "req-9",
      metadata: { newStatus: "denied", category: "access" },
    });
    const dump = JSON.stringify(await svc.list());
    // The service only ever receives compact metadata; assert nothing that
    // looks like PII or a token could be present.
    expect(dump).not.toMatch(/@/); // no email addresses
    expect(dump).not.toMatch(/[a-f0-9]{64}/); // no raw tokens
    expect(dump).toContain("denied");
    expect(dump).toContain("req-9");
  });

  it("recording never throws even if the underlying store fails", async () => {
    const brokenRepo = {
      create: async () => {
        throw new Error("db down");
      },
      list: async () => [],
      listForTarget: async () => [],
    } as unknown as PlatformAuditRepository;
    const svc = new PlatformAuditService(brokenRepo);
    await expect(
      svc.record({ action: "x", targetType: "y", targetId: "z" }),
    ).resolves.toBeUndefined();
  });
});
