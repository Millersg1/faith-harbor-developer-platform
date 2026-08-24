import { describe, expect, it } from "vitest";

import { DomainSupportActionRepository } from "./DomainSupportActionRepository";
import { InMemorySupportQueueReader, type SupportQueueItem } from "./DomainSupportQueue";
import { DomainSupportQueueService, SupportQueueError } from "./DomainSupportQueueService";

const NOW = "2026-09-01T00:00:00Z";

function build(rows: SupportQueueItem[]) {
  const reader = new InMemorySupportQueueReader(rows);
  const actions = new DomainSupportActionRepository();
  let seq = 0;
  const svc = new DomainSupportQueueService({ reader, actions, now: () => NOW, newId: () => `act${++seq}` });
  return { svc, actions };
}

const item = (over: Partial<SupportQueueItem> = {}): SupportQueueItem => ({
  category: "registration_unknown", itemRef: "ord1", organizationId: "orgA", state: "registration_unknown", since: NOW, ...over,
});

describe("Stage L5 — support queue service", () => {
  it("lists redacted rows + counts by category", async () => {
    const { svc } = build([item(), item({ category: "delivery_unknown", itemRef: "n1", state: "delivery_unknown" })]);
    const all = await svc.listQueue();
    expect(all.length).toBe(2);
    // Redaction: rows carry ONLY the redacted fields, never a domain/price/contact.
    expect(Object.keys(all[0]).sort()).toEqual(["category", "itemRef", "organizationId", "since", "state"]);
    const counts = await svc.counts();
    expect(counts.registration_unknown).toBe(1);
    expect(counts.delivery_unknown).toBe(1);
    expect(counts.stale_sync).toBe(0);
  });

  it("acknowledge needs no evidence; the org is taken from the live queue row", async () => {
    const { svc, actions } = build([item()]);
    const a = await svc.recordAction({ adminId: "admin1", category: "registration_unknown", itemRef: "ord1", action: "acknowledge" });
    expect(a.organizationId).toBe("orgA"); // authoritative, not client-supplied
    expect(a.adminId).toBe("admin1");
    expect((await actions.listForItem("registration_unknown", "ord1")).length).toBe(1);
  });

  it("record_reconciliation and escalate require a note", async () => {
    const { svc } = build([item()]);
    await expect(svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "record_reconciliation" }))
      .rejects.toMatchObject({ code: "NOTE_REQUIRED" });
    await expect(svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "escalate", note: "  " }))
      .rejects.toMatchObject({ code: "NOTE_REQUIRED" });
  });

  it("mark_resolved requires evidence AND a prior read-only reconciliation", async () => {
    const { svc } = build([item()]);
    // No evidence at all.
    await expect(svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "mark_resolved" }))
      .rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
    // Evidence but no prior reconciliation.
    await expect(svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "mark_resolved", evidence: "confirmed registered" }))
      .rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
    // Log the reconciliation, then resolve succeeds.
    await svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "record_reconciliation", note: "provider shows registered" });
    const resolved = await svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "mark_resolved", evidence: "provider getRegistrationStatus=registered" });
    expect(resolved.action).toBe("mark_resolved");
  });

  it("refuses to act on an item that is not in the live queue (no forged org)", async () => {
    const { svc } = build([item()]);
    await expect(svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ghost", action: "acknowledge" }))
      .rejects.toMatchObject({ code: "ITEM_NOT_IN_QUEUE" });
  });

  it("rejects an unknown (e.g. retry) verb — there is no mutation/retry action", async () => {
    const { svc } = build([item()]);
    await expect(svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "retry" as never }))
      .rejects.toBeInstanceOf(SupportQueueError);
  });

  it("getItem returns the redacted item + its append-only history", async () => {
    const { svc } = build([item()]);
    await svc.recordAction({ adminId: "a", category: "registration_unknown", itemRef: "ord1", action: "acknowledge", note: "looking" });
    const detail = await svc.getItem("registration_unknown", "ord1");
    expect(detail.item?.itemRef).toBe("ord1");
    expect(detail.actions.length).toBe(1);
    expect(detail.actions[0].action).toBe("acknowledge");
  });
});
