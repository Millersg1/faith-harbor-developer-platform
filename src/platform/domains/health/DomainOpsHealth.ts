/**
 * PII-FREE operational health for the domain lifecycle subsystem (credential-free
 * release). It aggregates ONLY coarse counts, timestamps, coarse states, a
 * derived age, the active mode, and a coarse disabled-reason enum. It NEVER
 * exposes a domain name, email, contact, EPP code, Stripe id, provider message,
 * price, key, or token. It powers an operator dashboard + alert thresholds; the
 * runbook lives in docs/38.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import type { DomainOperationsMode } from "../domainOperationsMode";
import type { SupportCategory, SupportQueueReader } from "../support/DomainSupportQueue";

/** Coarse notice-outbox + oldest-open-age metrics (cross-tenant, no PII). */
export interface DomainHealthReader {
  noticesByState(): Promise<Record<string, number>>;
  /** Age (seconds) of the OLDEST still-open (queued/retrying) notice, or null. */
  oldestOpenNoticeAgeSeconds(nowIso: string): Promise<number | null>;
}

export class PgDomainHealthReader implements DomainHealthReader {
  constructor(private readonly db: PgQueryable) {}

  async noticesByState(): Promise<Record<string, number>> {
    const r = await this.db.query(`SELECT status, count(*)::int n FROM domain_notices GROUP BY status`);
    const out: Record<string, number> = {};
    for (const row of r.rows) out[String(row.status)] = Number(row.n);
    return out;
  }

  async oldestOpenNoticeAgeSeconds(nowIso: string): Promise<number | null> {
    const r = await this.db.query(`SELECT min(created_at) oldest FROM domain_notices WHERE status IN ('queued','pre_acceptance_failure','sending')`);
    const oldest = r.rows[0]?.oldest;
    if (!oldest) return null;
    return Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(String(oldest))) / 1000));
  }
}

/** In-memory reader for unit tests. */
export class InMemoryDomainHealthReader implements DomainHealthReader {
  constructor(private readonly byState: Record<string, number> = {}, private readonly oldestOpenAge: number | null = null) {}
  async noticesByState(): Promise<Record<string, number>> { return { ...this.byState }; }
  async oldestOpenNoticeAgeSeconds(): Promise<number | null> { return this.oldestOpenAge; }
}

/** A coordinator-health snapshot as consumed here (PII-free by construction). */
export interface CoordinatorHealthLike {
  mode: DomainOperationsMode;
  running: boolean;
  lastTickAt: string | null;
  lastTickAgeSeconds: number | null;
  ticks: number;
  counts: Record<string, number>;
  lastReason: string;
}

export interface DomainOpsHealthThresholds {
  unknownsWarn: number;      // total *_unknown items
  staleSyncWarn: number;     // domain_sync_state errors
  oldestOpenWarnSeconds: number;
  refundFailureCritical: number;
  stuckLeaseWarn: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: DomainOpsHealthThresholds = {
  unknownsWarn: 1,
  staleSyncWarn: 5,
  oldestOpenWarnSeconds: 24 * 3600,
  refundFailureCritical: 1,
  stuckLeaseWarn: 1,
};

export interface DomainHealthAlert {
  key: string;
  severity: "info" | "warning" | "critical";
  value: number;
  threshold: number;
}

export interface DomainOpsHealthSnapshot {
  generatedAt: string;
  mode: DomainOperationsMode;
  running: boolean;
  disabledReason: string | null;
  workers: CoordinatorHealthLike | null;
  queue: Record<SupportCategory, number>;
  unknownsTotal: number;
  noticesByState: Record<string, number>;
  oldestOpenNoticeAgeSeconds: number | null;
  alerts: DomainHealthAlert[];
}

export interface DomainOpsHealthServiceDeps {
  support: SupportQueueReader;
  health: DomainHealthReader;
  coordinatorHealth: () => CoordinatorHealthLike | null;
  mode: () => DomainOperationsMode;
  disabledReason?: () => string | null;
  now: () => string;
  stuckLeaseAfterMs?: number;
  thresholds?: DomainOpsHealthThresholds;
}

const UNKNOWN_CATEGORIES: SupportCategory[] = ["registration_unknown", "renewal_unknown", "transfer_unknown", "delivery_unknown"];

export class DomainOpsHealthService {
  constructor(private readonly d: DomainOpsHealthServiceDeps) {}

  async snapshot(): Promise<DomainOpsHealthSnapshot> {
    const now = this.d.now();
    const th = this.d.thresholds ?? DEFAULT_HEALTH_THRESHOLDS;
    const queue = await this.d.support.counts({
      nowIso: now,
      staleLeaseBeforeIso: new Date(Date.parse(now) - (this.d.stuckLeaseAfterMs ?? 15 * 60_000)).toISOString(),
    });
    const noticesByState = await this.d.health.noticesByState();
    const oldestOpen = await this.d.health.oldestOpenNoticeAgeSeconds(now);
    const workers = this.d.coordinatorHealth();
    const mode = this.d.mode();

    const unknownsTotal = UNKNOWN_CATEGORIES.reduce((s, c) => s + (queue[c] ?? 0), 0);
    const alerts: DomainHealthAlert[] = [];
    const add = (key: string, severity: DomainHealthAlert["severity"], value: number, threshold: number) => {
      if (value >= threshold) alerts.push({ key, severity, value, threshold });
    };
    add("unknowns", "warning", unknownsTotal, th.unknownsWarn);
    add("needs_attention", "warning", queue.needs_attention ?? 0, 1);
    add("stale_sync", "warning", queue.stale_sync ?? 0, th.staleSyncWarn);
    add("refund_failure", "critical", queue.refund_failure ?? 0, th.refundFailureCritical);
    add("stuck_lease", "warning", queue.stuck_lease ?? 0, th.stuckLeaseWarn);
    if (oldestOpen !== null) add("oldest_open_notice", "warning", oldestOpen, th.oldestOpenWarnSeconds);
    if (workers && workers.lastReason === "tick_error") alerts.push({ key: "worker_tick_error", severity: "warning", value: 1, threshold: 1 });

    return {
      generatedAt: now,
      mode,
      running: workers?.running ?? false,
      disabledReason: this.d.disabledReason?.() ?? null,
      workers,
      queue,
      unknownsTotal,
      noticesByState,
      oldestOpenNoticeAgeSeconds: oldestOpen,
      alerts,
    };
  }
}
