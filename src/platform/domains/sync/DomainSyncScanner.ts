/**
 * Periodic provider-fact SYNC scanner (credential-free release). A FAIR,
 * RATE-LIMITED, strictly READ-ONLY refresh of active registrations: it polls the
 * registrar's read methods for status / expiration / lock / privacy / nameserver
 * delegation / lifecycle (transfer + verification hints) and stores the last
 * provider-CONFIRMED facts, tracking freshness and last success/failure honestly.
 *
 * It performs NO provider mutations, and runs in reconcile_only + full modes
 * (disabled by default — the coordinator gates it). Rate limits (per provider,
 * per tenant, platform-wide) throttle outbound calls; an item that cannot get a
 * token this tick is DEFERRED (rescheduled), never dropped. A transport failure
 * marks the row `error` and reschedules WITHOUT overwriting the confirmed facts,
 * so stale data is visibly stale rather than silently wrong.
 */

import { currentTenant, runWithTenant } from "../../../tenancy/TenantContext";
import type { DomainRegistrarProvider } from "../RegistrarProvider";
import type { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import type { TokenBucketRateLimiter } from "../ratelimit/TokenBucketRateLimiter";
import { DomainSyncRepository, type DueSync, type ObservedFacts } from "./DomainSyncRepository";

export interface DomainSyncScannerDeps {
  repo: DomainSyncRepository;
  registrations: DomainRegistrationRepository;
  registrar: DomainRegistrarProvider;
  now: () => string;
  /** Rate limiters gating outbound provider calls (all optional). */
  providerLimiter?: TokenBucketRateLimiter;
  tenantLimiter?: TokenBucketRateLimiter;
  platformLimiter?: TokenBucketRateLimiter;
  /** Base interval before a registration is re-synced (ms). */
  intervalMs?: number;
  /** Backoff after a failed refresh (ms). */
  failureBackoffMs?: number;
  /** Max jitter added to a reschedule (ms) to de-synchronize scans. */
  jitterMaxMs?: number;
  /** Injectable jitter in [0,1) for deterministic tests. */
  jitter?: () => number;
  /** Per-tenant claim cap per tick (fairness). */
  perTenant?: number;
}

export interface DomainSyncScannerHealth {
  lastRunAt: string | null;
  lastClaimed: number;
  lastRefreshed: number;
  lastFailed: number;
  lastRateDeferred: number;
}

export class DomainSyncScanner {
  private lastRunAt: string | null = null;
  private c = { claimed: 0, refreshed: 0, failed: 0, rateDeferred: 0 };

  constructor(private readonly d: DomainSyncScannerDeps) {}

  private jitter(): number {
    return (this.d.jitter ? this.d.jitter() : Math.random()) * (this.d.jitterMaxMs ?? 5 * 60_000);
  }
  private nextScanAt(baseMs: number): string {
    return new Date(Date.parse(this.d.now()) + baseMs + this.jitter()).toISOString();
  }

  async runOnce(owner: string): Promise<{ processed: number }> {
    const nowIso = this.d.now();
    this.lastRunAt = nowIso;
    this.c = { claimed: 0, refreshed: 0, failed: 0, rateDeferred: 0 };
    await this.d.repo.recoverExpiredLease(nowIso); // crash recovery
    // Seed rows: inside a tenant we can enumerate; globally (Postgres) the seed
    // is a self-contained INSERT..SELECT.
    const seed = currentTenant()
      ? (await this.d.registrations.list()).filter((r) => r.status === "active").map((r) => ({ registrationId: r.id, organizationId: r.organizationId, provider: r.provider }))
      : [];
    await this.d.repo.ensureRows(nowIso, seed);
    const claimed = await this.d.repo.claimDue(owner, nowIso, this.d.perTenant ?? 5);
    this.c.claimed = claimed.length;
    for (const item of claimed) {
      await runWithTenant({ organizationId: item.organizationId }, () => this.processOne(item));
    }
    return { processed: claimed.length };
  }

  /** True if every configured limiter grants a token for this call. */
  private allowedByLimiters(item: DueSync): boolean {
    const gates: Array<[TokenBucketRateLimiter | undefined, string]> = [
      [this.d.providerLimiter, `provider:${item.provider}`],
      [this.d.tenantLimiter, `tenant:${item.organizationId}`],
      [this.d.platformLimiter, "platform"],
    ];
    // Peek first so we don't spend a token on one gate when another will deny.
    if (!gates.every(([lim, key]) => !lim || lim.peek(key) >= 1)) return false;
    return gates.every(([lim, key]) => !lim || lim.tryRemove(key).allowed);
  }

  private async processOne(item: DueSync): Promise<void> {
    const nowIso = this.d.now();
    // Rate-limited: defer (reschedule) without calling the provider. This is a
    // throttle, NOT a failed refresh — facts, freshness, and the failure streak
    // are all left untouched.
    if (!this.allowedByLimiters(item)) {
      this.c.rateDeferred++;
      return this.d.repo.requeueSync({ registrationId: item.registrationId, nextScanAt: this.nextScanAt(this.d.failureBackoffMs ?? 3_600_000), nowIso });
    }
    try {
      const st = await this.d.registrar.getRegistrationStatus(await this.domainOf(item.registrationId));
      const facts: ObservedFacts = {
        status: st.registered ? "registered" : "not_registered",
        expiresAt: st.expiresAt,
        locked: st.locked,
        privacyEnabled: st.privacyEnabled,
        nameservers: st.nameservers,
        lifecycleState: st.lifecycleState,
        verificationRequired: verificationRequired(st.lifecycleState),
        // dnssec is only set from a provider-reported value; the interface does
        // not expose it here, so it stays undefined (never fabricated).
      };
      await this.d.repo.recordSuccess({ registrationId: item.registrationId, facts, nowIso, nextScanAt: this.nextScanAt(this.d.intervalMs ?? 12 * 3_600_000) });
      // Refresh the registration freshness flag + provider-confirmed expiry.
      await this.d.registrations.markSync(item.registrationId, "fresh", nowIso);
      if (st.registered && st.expiresAt) await this.d.registrations.setExpiry(item.registrationId, st.expiresAt, nowIso);
      this.c.refreshed++;
    } catch {
      // Transport/provider failure → mark error + reschedule; DO NOT overwrite
      // the confirmed facts. Downstream freshness now sees it as stale.
      this.c.failed++;
      await this.d.repo.recordFailure({ registrationId: item.registrationId, nowIso, nextScanAt: this.nextScanAt(this.d.failureBackoffMs ?? 3_600_000) });
      await this.d.registrations.markSyncState(item.registrationId, "error", nowIso);
    }
  }

  private async domainOf(registrationId: string): Promise<string> {
    const reg = await this.d.registrations.get(registrationId);
    return reg?.asciiDomain ?? "";
  }

  health(): DomainSyncScannerHealth {
    return {
      lastRunAt: this.lastRunAt,
      lastClaimed: this.c.claimed,
      lastRefreshed: this.c.refreshed,
      lastFailed: this.c.failed,
      lastRateDeferred: this.c.rateDeferred,
    };
  }
}

/** Verification-action-required is inferred ONLY from provider-reported lifecycle. */
export function verificationRequired(lifecycleState?: string): boolean {
  if (!lifecycleState) return false;
  return /verif|pendingverif|action|hold|clienthold|serverhold/i.test(lifecycleState);
}
