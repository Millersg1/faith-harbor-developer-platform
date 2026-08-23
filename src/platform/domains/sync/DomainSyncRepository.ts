/**
 * Persistence for the periodic provider-fact SYNC scanner (credential-free
 * release). Tenant-scoped, dual-mode. One row per active registration
 * (`domain_sync_state`) holds the LAST provider-CONFIRMED facts + freshness
 * bookkeeping + a scan lease.
 *
 * Honesty guarantees:
 *  - `recordSuccess` overwrites the observed facts and stamps last_success_at,
 *    resetting the failure streak — only ever from a real provider response.
 *  - `recordFailure` NEVER touches the observed facts or last_success_at; it just
 *    flips sync_state='error', stamps last_failure_at, and bumps the streak. So a
 *    failed refresh leaves the confirmed facts intact and VISIBLY stale.
 *  - claiming is FAIR: a per-tenant cap keeps one busy tenant from starving the
 *    others within a tick, on top of `FOR UPDATE SKIP LOCKED` cross-process
 *    safety.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";

export interface SyncStateRow {
  registrationId: string;
  organizationId: string;
  syncState: string; // fresh|error|unknown
  observedStatus?: string;
  observedExpiresAt?: string;
  observedLocked?: boolean;
  observedPrivacy?: boolean;
  observedNameservers?: string[];
  observedLifecycle?: string;
  verificationRequired: boolean;
  dnssec?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
  nextScanAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
}

export interface DueSync {
  registrationId: string;
  organizationId: string;
  provider: string;
}

export interface ObservedFacts {
  status: string;
  expiresAt?: string;
  locked?: boolean;
  privacyEnabled?: boolean;
  nameservers?: string[];
  lifecycleState?: string;
  verificationRequired: boolean;
  /** Only ever set from a provider-reported value; never fabricated. */
  dnssec?: string;
}

const LEASE_MS = 60_000;

export class DomainSyncRepository extends TenantScopedRepository {
  private readonly rows = new Map<string, SyncStateRow & { provider?: string; createdAt: string; updatedAt: string }>();

  constructor(db?: PgQueryable) {
    super(db);
  }

  /** Seeds a sync-state row for every active registration (idempotent, global). */
  async ensureRows(nowIso: string, activeRegs: { registrationId: string; organizationId: string; provider?: string }[] = []): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_sync_state (registration_id, organization_id, sync_state, created_at, updated_at)
         SELECT id, organization_id, 'unknown', $1, $1 FROM domain_registrations WHERE status='active'
         ON CONFLICT (registration_id) DO NOTHING`,
        [nowIso],
      );
      return;
    }
    for (const r of activeRegs) {
      if (!this.rows.has(r.registrationId)) {
        this.rows.set(r.registrationId, { registrationId: r.registrationId, organizationId: r.organizationId, provider: r.provider, syncState: "unknown", verificationRequired: false, consecutiveFailures: 0, createdAt: nowIso, updatedAt: nowIso });
      }
    }
  }

  /**
   * Claims due sync rows with a FAIR per-tenant cap, cross-process safe. A
   * candidate set is limited to `perTenant` rows per organization, then the
   * lease is taken under `FOR UPDATE SKIP LOCKED`.
   */
  async claimDue(owner: string, nowIso: string, perTenant = 5, limit = 50): Promise<DueSync[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `WITH cand AS (
           SELECT s.registration_id
             FROM (
               SELECT s.registration_id,
                      ROW_NUMBER() OVER (PARTITION BY s.organization_id ORDER BY s.next_scan_at ASC NULLS FIRST) AS rn
                 FROM domain_sync_state s
                 JOIN domain_registrations reg ON reg.id = s.registration_id
                WHERE reg.status='active'
                  AND (s.next_scan_at IS NULL OR s.next_scan_at <= $3)
                  AND (s.lease_until IS NULL OR s.lease_until < $3)
             ) s
            WHERE s.rn <= $4
         ),
         locked AS (
           SELECT s.registration_id
             FROM domain_sync_state s
            WHERE s.registration_id IN (SELECT registration_id FROM cand)
            ORDER BY s.next_scan_at ASC NULLS FIRST
            LIMIT $5
            FOR UPDATE OF s SKIP LOCKED
         )
         UPDATE domain_sync_state t SET lease_owner=$1, lease_until=$2, updated_at=$2
           WHERE t.registration_id IN (SELECT registration_id FROM locked)
         RETURNING t.registration_id, t.organization_id,
                   (SELECT provider FROM domain_registrations r WHERE r.id = t.registration_id) AS provider`,
        [owner, until, nowIso, perTenant, limit],
      );
      return r.rows.map((x) => ({ registrationId: String(x.registration_id), organizationId: String(x.organization_id), provider: String(x.provider ?? "") }));
    }
    // In-memory: group by tenant, take up to perTenant due rows each, cap at limit.
    const perOrg = new Map<string, number>();
    const due: DueSync[] = [];
    for (const s of [...this.rows.values()].sort((a, b) => (a.nextScanAt ?? "") < (b.nextScanAt ?? "") ? -1 : 1)) {
      if (due.length >= limit) break;
      if (s.nextScanAt && s.nextScanAt > nowIso) continue;
      if (s.leaseUntil && s.leaseUntil >= nowIso) continue;
      const n = perOrg.get(s.organizationId) ?? 0;
      if (n >= perTenant) continue;
      perOrg.set(s.organizationId, n + 1);
      s.leaseOwner = owner; s.leaseUntil = until;
      due.push({ registrationId: s.registrationId, organizationId: s.organizationId, provider: s.provider ?? "" });
    }
    return due;
  }

  /** Records a successful refresh: overwrites facts, stamps success, clears streak. */
  async recordSuccess(input: { registrationId: string; facts: ObservedFacts; nowIso: string; nextScanAt: string }): Promise<void> {
    const organizationId = this.tenantId();
    const f = input.facts;
    const ns = f.nameservers ? JSON.stringify(f.nameservers) : null;
    if (this.db) {
      await this.db.query(
        `UPDATE domain_sync_state SET sync_state='fresh', observed_status=$1, observed_expires_at=$2,
           observed_locked=$3, observed_privacy=$4, observed_nameservers=$5, observed_lifecycle=$6,
           verification_required=$7, dnssec=$8, last_success_at=$9, consecutive_failures=0,
           lease_owner=NULL, lease_until=NULL, next_scan_at=$10, updated_at=$9
         WHERE registration_id=$11 AND organization_id=$12`,
        [f.status, f.expiresAt ?? null, f.locked ?? null, f.privacyEnabled ?? null, ns, f.lifecycleState ?? null, f.verificationRequired, f.dnssec ?? null, input.nowIso, input.nextScanAt, input.registrationId, organizationId],
      );
      return;
    }
    const s = this.rows.get(input.registrationId);
    if (!s || s.organizationId !== organizationId) return;
    Object.assign(s, {
      syncState: "fresh", observedStatus: f.status, observedExpiresAt: f.expiresAt, observedLocked: f.locked,
      observedPrivacy: f.privacyEnabled, observedNameservers: f.nameservers, observedLifecycle: f.lifecycleState,
      verificationRequired: f.verificationRequired, dnssec: f.dnssec, lastSuccessAt: input.nowIso,
      consecutiveFailures: 0, leaseOwner: undefined, leaseUntil: undefined, nextScanAt: input.nextScanAt, updatedAt: input.nowIso,
    });
  }

  /**
   * Records a failed refresh. Preserves ALL observed facts + last_success_at;
   * only flips sync_state='error', stamps last_failure_at, bumps the streak, and
   * reschedules. The confirmed facts stay put and go visibly stale.
   */
  async recordFailure(input: { registrationId: string; nowIso: string; nextScanAt: string }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_sync_state SET sync_state='error', last_failure_at=$1,
           consecutive_failures=consecutive_failures+1, lease_owner=NULL, lease_until=NULL,
           next_scan_at=$2, updated_at=$1 WHERE registration_id=$3 AND organization_id=$4`,
        [input.nowIso, input.nextScanAt, input.registrationId, organizationId],
      );
      return;
    }
    const s = this.rows.get(input.registrationId);
    if (!s || s.organizationId !== organizationId) return;
    s.syncState = "error"; s.lastFailureAt = input.nowIso; s.consecutiveFailures += 1;
    s.leaseOwner = undefined; s.leaseUntil = undefined; s.nextScanAt = input.nextScanAt; s.updatedAt = input.nowIso;
  }

  /**
   * Releases the lease and reschedules WITHOUT recording a failure — used when a
   * rate limit deferred the call. sync_state, the confirmed facts, and the
   * failure streak are all untouched (a throttle is not a failed refresh).
   */
  async requeueSync(input: { registrationId: string; nextScanAt: string; nowIso: string }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_sync_state SET lease_owner=NULL, lease_until=NULL, next_scan_at=$1, updated_at=$2
           WHERE registration_id=$3 AND organization_id=$4`,
        [input.nextScanAt, input.nowIso, input.registrationId, organizationId],
      );
      return;
    }
    const s = this.rows.get(input.registrationId);
    if (!s || s.organizationId !== organizationId) return;
    s.leaseOwner = undefined; s.leaseUntil = undefined; s.nextScanAt = input.nextScanAt; s.updatedAt = input.nowIso;
  }

  async recoverExpiredLease(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(`UPDATE domain_sync_state SET lease_owner=NULL, lease_until=NULL, updated_at=$1 WHERE lease_until IS NOT NULL AND lease_until < $1`, [nowIso]);
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const s of this.rows.values()) if (s.leaseUntil && s.leaseUntil < nowIso) { s.leaseOwner = undefined; s.leaseUntil = undefined; n++; }
    return n;
  }

  async getState(registrationId: string): Promise<SyncStateRow | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(`SELECT * FROM domain_sync_state WHERE registration_id=$1 AND organization_id=$2`, [registrationId, organizationId]);
      return r.rows[0] ? mapSync(r.rows[0]) : undefined;
    }
    const s = this.rows.get(registrationId);
    return s && s.organizationId === organizationId ? { ...s } : undefined;
  }

  /** PII-free platform health: coarse totals only, never a domain/contact. */
  async healthCounts(): Promise<{ total: number; error: number; stale: number }> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT count(*)::int total,
                count(*) FILTER (WHERE sync_state='error')::int error,
                count(*) FILTER (WHERE consecutive_failures > 0)::int stale
           FROM domain_sync_state`);
      const row = r.rows[0] ?? {};
      return { total: Number(row.total ?? 0), error: Number(row.error ?? 0), stale: Number(row.stale ?? 0) };
    }
    const all = [...this.rows.values()];
    return { total: all.length, error: all.filter((s) => s.syncState === "error").length, stale: all.filter((s) => s.consecutiveFailures > 0).length };
  }
}

function mapSync(row: Record<string, unknown>): SyncStateRow {
  return {
    registrationId: String(row.registration_id),
    organizationId: String(row.organization_id),
    syncState: String(row.sync_state),
    observedStatus: row.observed_status ? String(row.observed_status) : undefined,
    observedExpiresAt: row.observed_expires_at ? String(row.observed_expires_at) : undefined,
    observedLocked: row.observed_locked === null || row.observed_locked === undefined ? undefined : Boolean(row.observed_locked),
    observedPrivacy: row.observed_privacy === null || row.observed_privacy === undefined ? undefined : Boolean(row.observed_privacy),
    observedNameservers: row.observed_nameservers ? (JSON.parse(String(row.observed_nameservers)) as string[]) : undefined,
    observedLifecycle: row.observed_lifecycle ? String(row.observed_lifecycle) : undefined,
    verificationRequired: Boolean(row.verification_required),
    dnssec: row.dnssec ? String(row.dnssec) : undefined,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : undefined,
    lastFailureAt: row.last_failure_at ? String(row.last_failure_at) : undefined,
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    nextScanAt: row.next_scan_at ? String(row.next_scan_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
  };
}
