import { describe, expect, it } from "vitest";

import { InMemorySupportQueueReader, type SupportQueueItem } from "../support/DomainSupportQueue";
import { DomainOpsHealthService, InMemoryDomainHealthReader, type CoordinatorHealthLike } from "./DomainOpsHealth";

const NOW = "2026-09-01T00:00:00Z";

function coord(over: Partial<CoordinatorHealthLike> = {}): CoordinatorHealthLike {
  return { mode: "reconcile_only", running: true, lastTickAt: NOW, lastTickAgeSeconds: 3, ticks: 10, counts: { syncScanned: 5 }, lastReason: "ok", ...over };
}

function build(rows: SupportQueueItem[], notices: Record<string, number> = {}, oldest: number | null = null, coordinator: CoordinatorHealthLike | null = coord()) {
  const svc = new DomainOpsHealthService({
    support: new InMemorySupportQueueReader(rows),
    health: new InMemoryDomainHealthReader(notices, oldest),
    coordinatorHealth: () => coordinator,
    mode: () => coordinator?.mode ?? "disabled",
    disabledReason: () => (coordinator ? null : "disabled_by_configuration"),
    now: () => NOW,
  });
  return svc;
}

const item = (c: SupportQueueItem["category"], ref: string): SupportQueueItem => ({ category: c, itemRef: ref, organizationId: "orgA", state: c, since: NOW });

describe("Stage L6 — PII-free domain ops health", () => {
  it("assembles coarse counts + worker health + notice depth", async () => {
    const svc = build(
      [item("registration_unknown", "o1"), item("delivery_unknown", "n1"), item("stale_sync", "reg1")],
      { queued: 4, accepted: 2, delivery_unknown: 1 },
      120,
    );
    const s = await svc.snapshot();
    expect(s.mode).toBe("reconcile_only");
    expect(s.running).toBe(true);
    expect(s.queue.registration_unknown).toBe(1);
    expect(s.unknownsTotal).toBe(2); // registration_unknown + delivery_unknown
    expect(s.noticesByState.queued).toBe(4);
    expect(s.oldestOpenNoticeAgeSeconds).toBe(120);
    expect(s.workers?.counts.syncScanned).toBe(5);
  });

  it("raises threshold alerts (refund failure is critical)", async () => {
    const svc = build([item("refund_failure", "rf1"), item("registration_unknown", "o1")], {}, null);
    const s = await svc.snapshot();
    const byKey = Object.fromEntries(s.alerts.map((a) => [a.key, a.severity]));
    expect(byKey.refund_failure).toBe("critical");
    expect(byKey.unknowns).toBe("warning");
  });

  it("flags a worker tick error", async () => {
    const svc = build([], {}, null, coord({ lastReason: "tick_error" }));
    const s = await svc.snapshot();
    expect(s.alerts.some((a) => a.key === "worker_tick_error")).toBe(true);
  });

  it("reports disabled mode + reason with no coordinator", async () => {
    const svc = build([], {}, null, null);
    const s = await svc.snapshot();
    expect(s.mode).toBe("disabled");
    expect(s.running).toBe(false);
    expect(s.disabledReason).toBe("disabled_by_configuration");
  });

  it("a clean system has no alerts and leaks no PII", async () => {
    const svc = build([], { accepted: 3 }, null);
    const s = await svc.snapshot();
    expect(s.alerts).toEqual([]);
    // Snapshot is coarse — no domain/email/id strings.
    expect(JSON.stringify(s)).not.toMatch(/@|\.com|sk_|epp/i);
  });
});
