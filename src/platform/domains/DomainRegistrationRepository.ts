/**
 * Tenant-scoped repository for confirmed domain registrations (ownership
 * records). Fail-closed: every method resolves the organization from the
 * ambient tenant context via `tenantId()` and constrains every query by it, so
 * there is no cross-tenant read/write path. Dual-mode: Postgres when a db is
 * present, an in-memory Map otherwise (offline tests).
 *
 * This is the representative repository proving the Stage 3 isolation pattern;
 * sibling repositories (orders, quotes, etc.) follow the same shape.
 */

import type { PgQueryable } from "../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";

export interface DomainRegistrationRecord {
  id: string;
  organizationId: string;
  orderId?: string;
  asciiDomain: string;
  unicodeDomain: string;
  tld: string;
  provider: string;
  providerDomainId?: string;
  registeredAt: string;
  expiresAt?: string;
  status: string;
  disposition: string;
  autorenewEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDomainRegistrationInput {
  id: string;
  orderId?: string;
  asciiDomain: string;
  unicodeDomain: string;
  tld: string;
  provider: string;
  providerDomainId?: string;
  registeredAt: string;
  expiresAt?: string;
}

export class DomainRegistrationRepository extends TenantScopedRepository {
  private readonly mem = new Map<string, DomainRegistrationRecord>();

  constructor(db?: PgQueryable) {
    super(db);
  }

  async create(
    input: CreateDomainRegistrationInput,
  ): Promise<DomainRegistrationRecord> {
    const organizationId = this.tenantId(); // stamped from context, never caller
    const now = input.registeredAt;
    const rec: DomainRegistrationRecord = {
      ...input,
      organizationId,
      status: "active",
      disposition: "retained_active",
      autorenewEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_registrations
           (id, organization_id, order_id, ascii_domain, unicode_domain, tld,
            provider, provider_domain_id, registered_at, expires_at, status,
            disposition, autorenew_enabled, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active','retained_active',false,$11,$11)`,
        [
          rec.id,
          organizationId,
          rec.orderId ?? null,
          rec.asciiDomain,
          rec.unicodeDomain,
          rec.tld,
          rec.provider,
          rec.providerDomainId ?? null,
          rec.registeredAt,
          rec.expiresAt ?? null,
          now,
        ],
      );
    } else {
      this.mem.set(rec.id, rec);
    }
    return rec;
  }

  async get(id: string): Promise<DomainRegistrationRecord | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_registrations WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      const row = r.rows[0];
      return row ? mapRow(row) : undefined;
    }
    const rec = this.mem.get(id);
    return rec && rec.organizationId === organizationId ? rec : undefined;
  }

  async list(): Promise<DomainRegistrationRecord[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_registrations WHERE organization_id = $1 ORDER BY created_at DESC`,
        [organizationId],
      );
      return r.rows.map(mapRow);
    }
    return [...this.mem.values()].filter(
      (x) => x.organizationId === organizationId,
    );
  }

  /**
   * Records the last successful provider synchronization + freshness of the
   * cached registrar facts. `state` ∈ fresh|stale|unknown|needs_attention.
   * Cached data is never presented as current registrar truth without this.
   */
  async markSync(id: string, state: string, at: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_registrations SET sync_state = $1, last_provider_sync_at = $2,
           updated_at = $2 WHERE id = $3 AND organization_id = $4`,
        [state, at, id, organizationId],
      );
      return;
    }
    const rec = this.mem.get(id);
    if (rec && rec.organizationId === organizationId) {
      (rec as unknown as { syncState: string; lastProviderSyncAt: string }).syncState = state;
      (rec as unknown as { lastProviderSyncAt: string }).lastProviderSyncAt = at;
    }
  }

  /**
   * Persists the provider-confirmed expiration date after a successful renewal
   * (also refreshes the sync freshness). Cached expiry is never advanced without
   * a provider-confirmed value.
   */
  async setExpiry(id: string, expiresAt: string, at: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_registrations SET expires_at=$1, sync_state='fresh',
           last_provider_sync_at=$2, updated_at=$2 WHERE id=$3 AND organization_id=$4`,
        [expiresAt, at, id, organizationId],
      );
      return;
    }
    const rec = this.mem.get(id);
    if (rec && rec.organizationId === organizationId) {
      rec.expiresAt = expiresAt;
      rec.updatedAt = at;
    }
  }

  async setDisposition(id: string, disposition: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_registrations SET disposition = $1, updated_at = $2
           WHERE id = $3 AND organization_id = $4`,
        [disposition, new Date().toISOString(), id, organizationId],
      );
      return;
    }
    const rec = this.mem.get(id);
    if (rec && rec.organizationId === organizationId) {
      rec.disposition = disposition;
    }
  }
}

function mapRow(row: Record<string, unknown>): DomainRegistrationRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    orderId: row.order_id ? String(row.order_id) : undefined,
    asciiDomain: String(row.ascii_domain),
    unicodeDomain: String(row.unicode_domain),
    tld: String(row.tld),
    provider: String(row.provider),
    providerDomainId: row.provider_domain_id
      ? String(row.provider_domain_id)
      : undefined,
    registeredAt: String(row.registered_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    status: String(row.status),
    disposition: String(row.disposition),
    autorenewEnabled: Boolean(row.autorenew_enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
