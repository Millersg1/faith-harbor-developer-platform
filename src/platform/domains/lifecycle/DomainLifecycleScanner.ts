/**
 * Registration-lifecycle + reminder scanner (credential-free release). READ-ONLY
 * against the provider; it never mutates a domain. For each due active
 * registration it reads the provider facts, classifies the lifecycle state
 * (provider-reported registry lifecycle wins; otherwise a reminder state derived
 * from the provider expiry + our windows — never an invented TLD deadline),
 * records the observation (idempotent; append-only history on transition), and
 * enqueues the appropriate reminder notice (deduped). A provider transport
 * failure marks the state STALE and never overwrites a confirmed fact.
 *
 * It runs in `reconcile_only` and `full` modes (read-only), disabled by default.
 */

import { currentTenant, runWithTenant } from "../../../tenancy/TenantContext";
import type { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import type { DomainNoticeRepository } from "../notices/DomainNoticeRepository";
import type { DomainRegistrarProvider } from "../RegistrarProvider";
import { classifyLifecycle, reminderNoticeFor, type LifecycleWindows } from "./lifecycleClassifier";
import type { DomainLifecycleRepository } from "./DomainLifecycleRepository";

export interface LifecycleScannerDeps {
  repo: DomainLifecycleRepository;
  registrations: DomainRegistrationRepository;
  registrar: DomainRegistrarProvider;
  notices: DomainNoticeRepository;
  now: () => string;
  newId: () => string;
  windows?: LifecycleWindows;
  /** Normal re-scan cadence (ms). */
  scanIntervalMs?: number;
  /** Backoff after a provider failure (ms). */
  staleBackoffMs?: number;
}

export interface LifecycleScannerHealth {
  lastRunAt: string | null;
  lastClaimed: number;
  lastTransitioned: number;
  lastReminders: number;
  lastStale: number;
}

const HOUR_MS = 3_600_000;

export class DomainLifecycleScanner {
  private lastRunAt: string | null = null;
  private lastClaimed = 0;
  private lastTransitioned = 0;
  private lastReminders = 0;
  private lastStale = 0;

  constructor(private readonly d: LifecycleScannerDeps) {}

  async runOnce(owner: string): Promise<{ processed: number }> {
    const nowIso = this.d.now();
    this.lastRunAt = nowIso;
    this.lastClaimed = this.lastTransitioned = this.lastReminders = this.lastStale = 0;
    await this.d.repo.recoverExpiredLease(nowIso);
    // Seed state rows. In-memory (within a tenant) uses the tenant's list;
    // Postgres seeds ALL active registrations globally (self-contained).
    const seed = currentTenant()
      ? (await this.d.registrations.list()).map((r) => ({ registrationId: r.id, organizationId: r.organizationId }))
      : [];
    await this.d.repo.ensureRows(nowIso, seed);
    const claimed = await this.d.repo.claimDue(owner, nowIso);
    this.lastClaimed = claimed.length;
    for (const item of claimed) {
      await runWithTenant({ organizationId: item.organizationId }, () => this.processOne(item.registrationId));
    }
    return { processed: claimed.length };
  }

  private nextScan() {
    return new Date(Date.parse(this.d.now()) + (this.d.scanIntervalMs ?? 12 * HOUR_MS)).toISOString();
  }
  private staleAt() {
    return new Date(Date.parse(this.d.now()) + (this.d.staleBackoffMs ?? HOUR_MS)).toISOString();
  }

  private async processOne(registrationId: string): Promise<void> {
    const reg = await this.d.registrations.get(registrationId);
    if (!reg) return; // vanished; nothing to observe
    let status;
    try {
      status = await this.d.registrar.getRegistrationStatus(reg.asciiDomain);
    } catch {
      // Provider unreachable → mark stale, keep the confirmed state, back off.
      this.lastStale++;
      await this.d.repo.markStale(registrationId, this.d.now(), this.staleAt());
      return;
    }
    const c = classifyLifecycle(
      { registered: status.registered, expiresAt: status.expiresAt, lifecycleState: status.lifecycleState },
      Date.parse(this.d.now()),
      this.d.windows,
    );
    const res = await this.d.repo.recordObservation({
      registrationId, state: c.state, confidence: c.confidence, source: reg.provider,
      reason: c.reason, observedAt: this.d.now(), nextScanAt: this.nextScan(), eventId: this.d.newId(),
    });
    if (res.transitioned) this.lastTransitioned++;
    const noticeType = reminderNoticeFor(c.state);
    if (noticeType) {
      const created = await this.d.notices.enqueue({ id: this.d.newId(), registrationId, noticeType, reason: c.state, now: this.d.now() });
      if (created) this.lastReminders++;
    }
  }

  health(): LifecycleScannerHealth {
    return {
      lastRunAt: this.lastRunAt,
      lastClaimed: this.lastClaimed,
      lastTransitioned: this.lastTransitioned,
      lastReminders: this.lastReminders,
      lastStale: this.lastStale,
    };
  }
}
