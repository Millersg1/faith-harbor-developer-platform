/**
 * Persistence for the registration-lifecycle scanner (credential-free release).
 * Tenant-scoped, dual-mode. Holds the CURRENT lifecycle state (one row per
 * registration, `domain_lifecycle_state`) + a scan lease; transitions append to
 * the immutable `domain_lifecycle_events` history. Provider transport failures
 * NEVER overwrite a previously confirmed state — they only mark it `stale`.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";

export interface LifecycleStateRow {
  registrationId: string;
  organizationId: string;
  lifecycleState: string;
  confidence: string;
  sourceProvider?: string;
  observedAt?: string;
  previousState?: string;
  transitionReason?: string;
  nextScanAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
}

export interface DueLifecycle {
  registrationId: string;
  organizationId: string;
  previousState: string;
}

const LEASE_MS = 60_000;

export class DomainLifecycleRepository extends TenantScopedRepository {
  private readonly rows = new Map<string, LifecycleStateRow & { createdAt: string; updatedAt: string }>();
  private readonly events: { registrationId: string; eventType: string; detail?: string; occurredAt: string }[] = [];

  constructor(db?: PgQueryable) {
    super(db);
  }

  /** Seeds a lifecycle-state row for every active registration (idempotent). */
  async ensureRows(nowIso: string, activeRegs: { registrationId: string; organizationId: string }[] = []): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_lifecycle_state (registration_id, organization_id, lifecycle_state, confidence, created_at, updated_at)
         SELECT id, organization_id, 'unknown', 'derived', $1, $1 FROM domain_registrations WHERE status='active'
         ON CONFLICT (registration_id) DO NOTHING`,
        [nowIso],
      );
      return;
    }
    for (const r of activeRegs) {
      if (!this.rows.has(r.registrationId)) {
        this.rows.set(r.registrationId, { registrationId: r.registrationId, organizationId: r.organizationId, lifecycleState: "unknown", confidence: "derived", createdAt: nowIso, updatedAt: nowIso });
      }
    }
  }

  /** Claims due lifecycle rows for active registrations (FOR UPDATE SKIP LOCKED). */
  async claimDue(owner: string, nowIso: string, limit = 50): Promise<DueLifecycle[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_lifecycle_state SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE registration_id IN (
           SELECT s.registration_id FROM domain_lifecycle_state s
             JOIN domain_registrations reg ON reg.id = s.registration_id
             WHERE reg.status='active'
               AND (s.next_scan_at IS NULL OR s.next_scan_at <= $3)
               AND (s.lease_until IS NULL OR s.lease_until < $3)
             ORDER BY s.next_scan_at ASC NULLS FIRST LIMIT $4
             FOR UPDATE OF s SKIP LOCKED)
         RETURNING registration_id, organization_id, lifecycle_state`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map((x) => ({ registrationId: String(x.registration_id), organizationId: String(x.organization_id), previousState: String(x.lifecycle_state) }));
    }
    const due: DueLifecycle[] = [];
    for (const s of this.rows.values()) {
      if (due.length >= limit) break;
      if (s.nextScanAt && s.nextScanAt > nowIso) continue;
      if (s.leaseUntil && s.leaseUntil >= nowIso) continue;
      s.leaseOwner = owner; s.leaseUntil = until;
      due.push({ registrationId: s.registrationId, organizationId: s.organizationId, previousState: s.lifecycleState });
    }
    return due;
  }

  /**
   * Records an observed state. Idempotent: an unchanged state just refreshes
   * observed_at/confidence; a CHANGED state sets previous_state + appends an
   * immutable lifecycle event. Clears the lease + sets next_scan_at.
   */
  async recordObservation(input: {
    registrationId: string; state: string; confidence: string; source: string;
    reason: string; observedAt: string; nextScanAt: string; eventId: string;
  }): Promise<{ transitioned: boolean }> {
    const organizationId = this.tenantId();
    if (this.db) {
      const cur = await this.db.query(`SELECT lifecycle_state FROM domain_lifecycle_state WHERE registration_id=$1 AND organization_id=$2`, [input.registrationId, organizationId]);
      const prev = cur.rows[0] ? String(cur.rows[0].lifecycle_state) : "unknown";
      const transitioned = prev !== input.state;
      await this.db.query(
        `UPDATE domain_lifecycle_state SET lifecycle_state=$1, confidence=$2, source_provider=$3,
           observed_at=$4, previous_state=$5, transition_reason=$6, lease_owner=NULL, lease_until=NULL,
           next_scan_at=$7, updated_at=$4 WHERE registration_id=$8 AND organization_id=$9`,
        [input.state, input.confidence, input.source, input.observedAt, transitioned ? prev : (cur.rows[0]?.previous_state ?? null), input.reason, input.nextScanAt, input.registrationId, organizationId],
      );
      if (transitioned) {
        await this.db.query(
          `INSERT INTO domain_lifecycle_events (id, organization_id, registration_id, event_type, detail, occurred_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$6)`,
          [input.eventId, organizationId, input.registrationId, `lifecycle:${input.state}`, input.reason, input.observedAt],
        );
      }
      return { transitioned };
    }
    const s = this.rows.get(input.registrationId);
    if (!s || s.organizationId !== organizationId) return { transitioned: false };
    const transitioned = s.lifecycleState !== input.state;
    if (transitioned) { s.previousState = s.lifecycleState; this.events.push({ registrationId: input.registrationId, eventType: `lifecycle:${input.state}`, detail: input.reason, occurredAt: input.observedAt }); }
    s.lifecycleState = input.state; s.confidence = input.confidence; s.sourceProvider = input.source;
    s.observedAt = input.observedAt; s.transitionReason = input.reason; s.leaseOwner = undefined; s.leaseUntil = undefined; s.nextScanAt = input.nextScanAt; s.updatedAt = input.observedAt;
    return { transitioned };
  }

  /** Provider unreachable → mark stale WITHOUT overwriting the confirmed state. */
  async markStale(registrationId: string, nowIso: string, nextScanAt: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_lifecycle_state SET confidence='stale', lease_owner=NULL, lease_until=NULL,
           next_scan_at=$1, updated_at=$2 WHERE registration_id=$3 AND organization_id=$4`,
        [nextScanAt, nowIso, registrationId, organizationId],
      );
      return;
    }
    const s = this.rows.get(registrationId);
    if (s && s.organizationId === organizationId) { s.confidence = "stale"; s.leaseOwner = undefined; s.leaseUntil = undefined; s.nextScanAt = nextScanAt; s.updatedAt = nowIso; }
  }

  async recoverExpiredLease(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(`UPDATE domain_lifecycle_state SET lease_owner=NULL, lease_until=NULL, updated_at=$1 WHERE lease_until IS NOT NULL AND lease_until < $1`, [nowIso]);
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const s of this.rows.values()) if (s.leaseUntil && s.leaseUntil < nowIso) { s.leaseOwner = undefined; s.leaseUntil = undefined; n++; }
    return n;
  }

  async getState(registrationId: string): Promise<LifecycleStateRow | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(`SELECT * FROM domain_lifecycle_state WHERE registration_id=$1 AND organization_id=$2`, [registrationId, organizationId]);
      return r.rows[0] ? mapState(r.rows[0]) : undefined;
    }
    const s = this.rows.get(registrationId);
    return s && s.organizationId === organizationId ? { ...s } : undefined;
  }

  /** In-memory event count for a registration (tests). */
  countEvents(registrationId: string): number {
    return this.events.filter((e) => e.registrationId === registrationId).length;
  }
}

function mapState(row: Record<string, unknown>): LifecycleStateRow {
  return {
    registrationId: String(row.registration_id),
    organizationId: String(row.organization_id),
    lifecycleState: String(row.lifecycle_state),
    confidence: String(row.confidence),
    sourceProvider: row.source_provider ? String(row.source_provider) : undefined,
    observedAt: row.observed_at ? String(row.observed_at) : undefined,
    previousState: row.previous_state ? String(row.previous_state) : undefined,
    transitionReason: row.transition_reason ? String(row.transition_reason) : undefined,
    nextScanAt: row.next_scan_at ? String(row.next_scan_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
  };
}
