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
