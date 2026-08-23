/**
 * Durable AUTOMATIC-RENEWAL scanner (credential-free lifecycle release).
 *
 * Finds registrations eligible for auto-renewal and invokes the existing
 * customer-funded renewal-creation service. It NEVER enables the registrar's own
 * balance auto-renew, and only runs in `full` domain-operations mode (the
 * coordinator gates it); it is disabled by default.
 *
 * Eligibility (ALL required):
 *  - active registration; auto-renew explicitly enabled; a saved off-session
 *    payment method reference; a FRESH provider-confirmed expiration date; the
 *    expiry within the configured renewal window; and no blocking condition
 *    (in-flight transfer / needs_attention / dispute) reported by the injected
 *    guard.
 *
 * Safety:
 *  - claims use `FOR UPDATE SKIP LOCKED`; each item is processed inside
 *    `runWithTenant(item.organizationId)`; the DB `domain_renewal_active_uniq`
 *    index is the FINAL duplicate guard (a duplicate simply converges).
 *  - a STALE provider sync DEFERS (reschedules) and does not guess.
 *  - a missing/declined payment method creates an ACTION-NEEDED notice and does
 *    NOT attempt a registrar renewal.
 */

import { runWithTenant } from "../../../tenancy/TenantContext";
import type { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import type { DomainNoticeRepository } from "../notices/DomainNoticeRepository";
import { AutoRenewNotAuthorized, DomainRenewalSaga } from "./DomainRenewalSaga";
import { DuplicateRenewalError, type DomainRenewalRepository } from "./DomainRenewalRepository";

export interface AutoRenewSchedulerDeps {
  repo: DomainRenewalRepository;
  registrations: DomainRegistrationRepository;
  saga: DomainRenewalSaga;
  notices: DomainNoticeRepository;
  now: () => string;
  newId: () => string;
  /** Renewal window: renew when expiry is within this many days. */
  windowDays?: number;
  /** Max age of a provider sync to be considered fresh (ms). */
  freshnessMaxAgeMs?: number;
  /** Backoff before re-scanning a deferred registration (ms). */
  deferBackoffMs?: number;
  /** True if a transfer/needs_attention/dispute blocks auto-renewal. */
  blockingCondition?: (registrationId: string) => Promise<boolean>;
}

export interface AutoRenewSchedulerHealth {
  lastRunAt: string | null;
  lastClaimed: number;
  lastRenewed: number;
  lastDeferred: number;
  lastActionNeeded: number;
}

const DAY_MS = 86_400_000;

export class DomainAutoRenewScheduler {
  private lastRunAt: string | null = null;
  private lastClaimed = 0;
  private lastRenewed = 0;
  private lastDeferred = 0;
  private lastActionNeeded = 0;

  constructor(private readonly d: AutoRenewSchedulerDeps) {}

  private windowMs() {
    return (this.d.windowDays ?? 30) * DAY_MS;
  }
  private deferAt() {
    return new Date(Date.parse(this.d.now()) + (this.d.deferBackoffMs ?? 6 * 3_600_000)).toISOString();
  }

  async runOnce(owner: string): Promise<{ processed: number }> {
    const nowIso = this.d.now();
    this.lastRunAt = nowIso;
    this.lastClaimed = this.lastRenewed = this.lastDeferred = this.lastActionNeeded = 0;
    await this.d.repo.recoverExpiredAutoRenewLease(nowIso); // crash recovery
    const withinIso = new Date(Date.parse(nowIso) + this.windowMs()).toISOString();
    const claimed = await this.d.repo.claimDueAutoRenew(owner, nowIso, withinIso);
    this.lastClaimed = claimed.length;
    for (const item of claimed) {
      await runWithTenant({ organizationId: item.organizationId }, () => this.processOne(item.registrationId, withinIso));
    }
    return { processed: claimed.length };
  }

  private async processOne(registrationId: string, withinIso: string): Promise<void> {
    const reg = await this.d.registrations.get(registrationId);
    // Terminal / not-active / transferred-away → stop scanning it.
    if (!reg || reg.status !== "active") {
      await this.d.repo.finishAutoRenewScan(registrationId, farFuture(this.d.now()));
      return;
    }
    // Blocking condition (in-flight transfer / needs_attention / dispute) → defer.
    if (this.d.blockingCondition && (await this.d.blockingCondition(registrationId))) {
      this.lastDeferred++;
      return this.d.repo.finishAutoRenewScan(registrationId, this.deferAt());
    }
    // Stale provider facts → DEFER and let the sync scanner refresh; never guess.
    if (!this.isFresh(reg)) {
      this.lastDeferred++;
      return this.d.repo.finishAutoRenewScan(registrationId, this.deferAt());
    }
    // Not yet within the renewal window → reschedule near the window opening.
    if (!reg.expiresAt || reg.expiresAt > withinIso) {
      this.lastDeferred++;
      return this.d.repo.finishAutoRenewScan(registrationId, this.deferAt());
    }
    // Eligible → invoke the customer-funded renewal (off-session). The DB unique
    // index is the final duplicate guard.
    try {
      const res = await this.d.saga.createAutoRenewal(registrationId);
      if (res.status === "renewal_queued") {
        // Captured → the registrar renewal is queued for the worker.
        this.lastRenewed++;
        await this.d.repo.finishAutoRenewScan(registrationId, farFuture(this.d.now()));
      } else {
        // Off-session declined/requires-action → NO registrar renewal happened;
        // raise an action-needed notice and defer.
        this.lastActionNeeded++;
        await this.d.notices.enqueue({ id: this.d.newId(), registrationId, noticeType: "auto_renew_action_required", reason: "off_session_declined", now: this.d.now() });
        await this.d.repo.finishAutoRenewScan(registrationId, this.deferAt());
      }
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "DuplicateRenewalError" || e instanceof DuplicateRenewalError) {
        // Already a renewal for this cycle — converged. Stop scanning this cycle.
        await this.d.repo.finishAutoRenewScan(registrationId, farFuture(this.d.now()));
        return;
      }
      if (name === "AutoRenewNotAuthorized" || e instanceof AutoRenewNotAuthorized) {
        // Missing/declined payment method → ACTION-NEEDED notice; never renew.
        this.lastActionNeeded++;
        await this.d.notices.enqueue({ id: this.d.newId(), registrationId, noticeType: "auto_renew_action_required", reason: "payment_method_ineligible", now: this.d.now() });
        await this.d.repo.finishAutoRenewScan(registrationId, this.deferAt());
        return;
      }
      // Transient/other → defer with backoff.
      this.lastDeferred++;
      await this.d.repo.finishAutoRenewScan(registrationId, this.deferAt());
    }
  }

  private isFresh(reg: { syncState?: string; lastProviderSyncAt?: string }): boolean {
    if (reg.syncState !== "fresh" || !reg.lastProviderSyncAt) return false;
    return Date.parse(this.d.now()) - Date.parse(reg.lastProviderSyncAt) <= (this.d.freshnessMaxAgeMs ?? DAY_MS);
  }

  health(): AutoRenewSchedulerHealth {
    return {
      lastRunAt: this.lastRunAt,
      lastClaimed: this.lastClaimed,
      lastRenewed: this.lastRenewed,
      lastDeferred: this.lastDeferred,
      lastActionNeeded: this.lastActionNeeded,
    };
  }
}

function farFuture(nowIso: string): string {
  return new Date(Date.parse(nowIso) + 365 * DAY_MS).toISOString();
}
