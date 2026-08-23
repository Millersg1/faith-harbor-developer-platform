/**
 * Tenant-scoped persistence for the transactional domain-notice outbox
 * (`domain_notices`). Fail-closed, dual-mode. This release adds ENQUEUE (with
 * per-(registration, type) dedup); the delivery worker (later commit) adds
 * lease-claiming + append-only attempt history over the same table.
 *
 * Notices carry NO PII/secrets in their persisted row — a stable `notice_type`,
 * a coarse `reason`, and status only. The rendered subject/body is produced at
 * delivery time from the type + trusted tenant context, never stored here.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";

export interface DomainNoticeRow {
  id: string;
  organizationId: string;
  registrationId: string;
  noticeType: string;
  status: string; // queued|sending|accepted|rejected|pre_acceptance_failure|delivery_unknown|terminal|skipped
  attempts: number;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  providerId?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export class DomainNoticeRepository extends TenantScopedRepository {
  protected readonly notices = new Map<string, DomainNoticeRow>();
  /** In-memory append-only attempt log (Postgres uses domain_notice_attempts). */
  protected readonly attempts = new Map<string, Array<{ attemptNo: number; classification: string; reason?: string }>>();

  constructor(db?: PgQueryable) {
    super(db);
  }

  /**
   * Enqueues a notice, deduped per (registration, type) via the unique index.
   * Returns true if a NEW row was created, false if one already existed.
   */
  async enqueue(input: {
    id: string;
    registrationId: string;
    noticeType: string;
    reason?: string;
    now: string;
  }): Promise<boolean> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `INSERT INTO domain_notices
           (id, organization_id, registration_id, notice_type, status, attempts, reason, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'queued',0,$5,$6,$6)
         ON CONFLICT (registration_id, notice_type) DO NOTHING`,
        [input.id, organizationId, input.registrationId, input.noticeType, input.reason ?? null, input.now],
      );
      return (r.rowCount ?? 0) === 1;
    }
    for (const n of this.notices.values()) {
      if (n.registrationId === input.registrationId && n.noticeType === input.noticeType) return false;
    }
    this.notices.set(input.id, {
      id: input.id, organizationId, registrationId: input.registrationId, noticeType: input.noticeType,
      status: "queued", attempts: 0, reason: input.reason, createdAt: input.now, updatedAt: input.now,
    });
    return true;
  }

  /**
   * Claims up to `limit` sendable notices for `owner`, cross-process safe via
   * `FOR UPDATE ... SKIP LOCKED`. Eligible = status queued OR a prior
   * pre_acceptance_failure whose backoff has elapsed, whose lease is free/expired.
   * Sets status='sending' + a fresh lease. Terminal states (accepted/rejected/
   * delivery_unknown/terminal/skipped) are never re-claimed.
   */
  async claimDue(owner: string, nowIso: string, leaseUntilIso: string, limit = 20): Promise<DomainNoticeRow[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_notices SET status='sending', lease_owner=$1, lease_until=$2, updated_at=$3
           WHERE id IN (
             SELECT id FROM domain_notices
              WHERE status IN ('queued','pre_acceptance_failure')
                AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
                AND (lease_until IS NULL OR lease_until <= $3)
              ORDER BY created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT $4)
         RETURNING *`,
        [owner, leaseUntilIso, nowIso, limit],
      );
      return r.rows.map(mapNotice);
    }
    const due: DomainNoticeRow[] = [];
    for (const n of this.notices.values()) {
      if (due.length >= limit) break;
      const claimable = (n.status === "queued" || n.status === "pre_acceptance_failure")
        && (!n.nextAttemptAt || n.nextAttemptAt <= nowIso)
        && (!n.leaseUntil || n.leaseUntil <= nowIso);
      if (!claimable) continue;
      n.status = "sending"; n.leaseOwner = owner; n.leaseUntil = leaseUntilIso; n.updatedAt = nowIso;
      due.push({ ...n });
    }
    return due;
  }

  /** Appends an immutable delivery-attempt row (INSERT only, never updated). */
  async appendAttempt(input: {
    id: string; noticeId: string; registrationId: string;
    attemptNo: number; classification: string; reason?: string; now: string;
  }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_notice_attempts
           (id, organization_id, notice_id, registration_id, attempt_no, classification, reason, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.id, organizationId, input.noticeId, input.registrationId, input.attemptNo, input.classification, input.reason ?? null, input.now],
      );
      return;
    }
    const list = this.attempts.get(input.noticeId) ?? [];
    list.push({ attemptNo: input.attemptNo, classification: input.classification, reason: input.reason });
    this.attempts.set(input.noticeId, list);
  }

  /**
   * Records the outcome of an attempt: bumps the attempt counter, sets the new
   * status, schedules the next attempt (only for a retry), and RELEASES the lease.
   */
  async settle(input: { noticeId: string; status: string; nextAttemptAt?: string; now: string }): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE domain_notices
            SET status=$2, attempts=attempts+1, next_attempt_at=$3,
                lease_owner=NULL, lease_until=NULL, updated_at=$4
          WHERE id=$1`,
        [input.noticeId, input.status, input.nextAttemptAt ?? null, input.now],
      );
      return;
    }
    const n = this.notices.get(input.noticeId);
    if (!n) return;
    n.status = input.status; n.attempts += 1; n.nextAttemptAt = input.nextAttemptAt;
    n.leaseOwner = undefined; n.leaseUntil = undefined; n.updatedAt = input.now;
  }

  /**
   * Releases a claimed notice back to `queued` WITHOUT counting a delivery
   * attempt — used when delivery is not yet configured (no recipient/transport).
   * The notice stays alive so it flows once delivery is wired.
   */
  async requeue(input: { noticeId: string; nextAttemptAt?: string; now: string }): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE domain_notices SET status='queued', next_attempt_at=$2, lease_owner=NULL, lease_until=NULL, updated_at=$3
           WHERE id=$1`,
        [input.noticeId, input.nextAttemptAt ?? null, input.now],
      );
      return;
    }
    const n = this.notices.get(input.noticeId);
    if (!n) return;
    n.status = "queued"; n.nextAttemptAt = input.nextAttemptAt;
    n.leaseOwner = undefined; n.leaseUntil = undefined; n.updatedAt = input.now;
  }

  /**
   * Crash recovery: a notice stuck in `sending` past its lease is returned to
   * `queued` so it can be re-claimed. It is NOT settled or resent here — the
   * worker re-evaluates it. Never touches terminal states.
   */
  async recoverExpiredLease(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_notices SET status='queued', lease_owner=NULL, lease_until=NULL, updated_at=$1
           WHERE status='sending' AND lease_until IS NOT NULL AND lease_until <= $1`,
        [nowIso],
      );
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const row of this.notices.values()) {
      if (row.status === "sending" && row.leaseUntil && row.leaseUntil <= nowIso) {
        row.status = "queued"; row.leaseOwner = undefined; row.leaseUntil = undefined; row.updatedAt = nowIso; n++;
      }
    }
    return n;
  }

  /** Immutable attempt history for a notice (oldest first). */
  async listAttempts(noticeId: string): Promise<Array<{ attemptNo: number; classification: string; reason?: string }>> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT attempt_no, classification, reason FROM domain_notice_attempts
          WHERE notice_id=$1 AND organization_id=$2 ORDER BY attempt_no ASC`,
        [noticeId, this.tenantId()],
      );
      return r.rows.map((row) => ({ attemptNo: Number(row.attempt_no), classification: String(row.classification), reason: row.reason ? String(row.reason) : undefined }));
    }
    return [...(this.attempts.get(noticeId) ?? [])];
  }

  async getById(noticeId: string): Promise<DomainNoticeRow | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_notices WHERE id=$1 AND organization_id=$2`,
        [noticeId, this.tenantId()],
      );
      return r.rows[0] ? mapNotice(r.rows[0]) : undefined;
    }
    const n = this.notices.get(noticeId);
    return n && n.organizationId === this.tenantId() ? { ...n } : undefined;
  }

  async listByRegistration(registrationId: string): Promise<DomainNoticeRow[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_notices WHERE registration_id=$1 AND organization_id=$2 ORDER BY created_at ASC`,
        [registrationId, organizationId],
      );
      return r.rows.map(mapNotice);
    }
    return [...this.notices.values()].filter((n) => n.registrationId === registrationId && n.organizationId === organizationId).map((n) => ({ ...n }));
  }
}

export function mapNotice(row: Record<string, unknown>): DomainNoticeRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    registrationId: String(row.registration_id),
    noticeType: String(row.notice_type),
    status: String(row.status),
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
