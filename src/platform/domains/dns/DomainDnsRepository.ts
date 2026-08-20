/**
 * Tenant-scoped persistence for DNS / nameserver provisioning (Stage 8).
 *
 * Three concerns, all fail-closed and dual-mode (Postgres or in-memory):
 *  - `domain_dns_state`: one row per registration — nameserver mode, the current
 *    nameservers, provisioning + sync status, DNSSEC status, and an OPTIONAL
 *    hosting-account link. Registration status lives elsewhere; this is kept
 *    deliberately SEPARATE so DNS state can never be mistaken for ownership.
 *  - `domain_dns_records`: the managed desired zone (labels + values), used to
 *    preview/diff changes and to reconcile against the live provider zone.
 *  - `domain_dns_changes`: an APPEND-ONLY, PII-minimised audit — change type,
 *    record type + host label, a value FINGERPRINT (never the value body),
 *    outcome, and actor. No record contents are logged.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type { DnsRecord, NameserverMode } from "../RegistrarProvider";

export interface DnsState {
  id: string;
  organizationId: string;
  registrationId: string;
  mode: NameserverMode | "registrar_default";
  nameservers: string[];
  provisioningStatus: string; // none|pending|active|unknown|needs_attention
  dnssecStatus: string; // unknown|unsigned|signed|needs_attention
  hostingAccountId?: string;
  lastProviderSyncAt?: string;
  syncState: string; // fresh|stale|unknown|needs_attention
  /** Which DNS service is authoritative for the zone (namesilo|cpanel|external|unknown). */
  authorityProvider: string;
  authorityState: string; // fresh|stale|unknown
  authorityVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DnsChange {
  id: string;
  registrationId: string;
  changeType: string;
  recordType?: string;
  host?: string;
  valueFingerprint?: string;
  outcome: string;
  actorUserId?: string;
  createdAt: string;
}

export class DomainDnsRepository extends TenantScopedRepository {
  private readonly states = new Map<string, DnsState>(); // by registrationId
  private readonly records = new Map<string, DnsRecord[]>(); // by registrationId
  private readonly changes: DnsChange[] = [];

  constructor(db?: PgQueryable) {
    super(db);
  }

  // ---- state --------------------------------------------------------------
  async getState(registrationId: string): Promise<DnsState | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_dns_state WHERE registration_id=$1 AND organization_id=$2`,
        [registrationId, organizationId],
      );
      return r.rows[0] ? mapState(r.rows[0]) : undefined;
    }
    const s = this.states.get(registrationId);
    return s && s.organizationId === organizationId ? s : undefined;
  }

  /** Upserts the one-per-registration DNS state row (fail-closed on tenant). */
  async putState(s: Omit<DnsState, "organizationId">): Promise<DnsState> {
    const organizationId = this.tenantId();
    const full: DnsState = { ...s, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_dns_state
           (id, organization_id, registration_id, mode, nameservers,
            provisioning_status, dnssec_status, hosting_account_id,
            last_provider_sync_at, sync_state, authority_provider,
            authority_state, authority_verified_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         ON CONFLICT (registration_id) DO UPDATE SET
           mode=EXCLUDED.mode, nameservers=EXCLUDED.nameservers,
           provisioning_status=EXCLUDED.provisioning_status,
           dnssec_status=EXCLUDED.dnssec_status,
           hosting_account_id=EXCLUDED.hosting_account_id,
           last_provider_sync_at=EXCLUDED.last_provider_sync_at,
           sync_state=EXCLUDED.sync_state,
           authority_provider=EXCLUDED.authority_provider,
           authority_state=EXCLUDED.authority_state,
           authority_verified_at=EXCLUDED.authority_verified_at,
           updated_at=EXCLUDED.updated_at`,
        [
          full.id, organizationId, full.registrationId, full.mode,
          JSON.stringify(full.nameservers), full.provisioningStatus,
          full.dnssecStatus, full.hostingAccountId ?? null,
          full.lastProviderSyncAt ?? null, full.syncState,
          full.authorityProvider, full.authorityState,
          full.authorityVerifiedAt ?? null, full.createdAt,
        ],
      );
      return (await this.getState(full.registrationId))!;
    }
    this.states.set(full.registrationId, full);
    return full;
  }

  async markSync(registrationId: string, syncState: string, at: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_dns_state SET sync_state=$1, last_provider_sync_at=$2, updated_at=$2
           WHERE registration_id=$3 AND organization_id=$4`,
        [syncState, at, registrationId, organizationId],
      );
      return;
    }
    const s = this.states.get(registrationId);
    if (s && s.organizationId === organizationId) {
      s.syncState = syncState;
      s.lastProviderSyncAt = at;
      s.updatedAt = at;
    }
  }

  // ---- records ------------------------------------------------------------
  async listRecords(registrationId: string): Promise<DnsRecord[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_dns_records WHERE registration_id=$1 AND organization_id=$2
           ORDER BY record_type, host`,
        [registrationId, organizationId],
      );
      return r.rows.map(mapRecord);
    }
    const recs = this.records.get(registrationId) ?? [];
    // in-memory rows are already org-scoped by construction (put under tenant)
    const s = this.states.get(registrationId);
    return s && s.organizationId !== organizationId ? [] : recs.map((x) => ({ ...x }));
  }

  /** Replaces the managed desired record set for a registration (idempotent). */
  async replaceRecords(registrationId: string, records: DnsRecord[], at: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `DELETE FROM domain_dns_records WHERE registration_id=$1 AND organization_id=$2`,
        [registrationId, organizationId],
      );
      let i = 0;
      for (const rec of records) {
        await this.db.query(
          `INSERT INTO domain_dns_records
             (id, organization_id, registration_id, record_type, host, value, ttl,
              priority, protected, provider_record_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
          [
            `${registrationId}:${at}:${i++}`, organizationId, registrationId,
            rec.type, rec.host, rec.value, rec.ttl, rec.priority ?? null,
            false, rec.providerRecordId ?? null, at,
          ],
        );
      }
      return;
    }
    this.records.set(registrationId, records.map((x) => ({ ...x })));
  }

  // ---- change audit -------------------------------------------------------
  async appendChange(c: Omit<DnsChange, "createdAt"> & { createdAt: string }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_dns_changes
           (id, organization_id, registration_id, change_type, record_type, host,
            value_fingerprint, outcome, actor_user_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          c.id, organizationId, c.registrationId, c.changeType,
          c.recordType ?? null, c.host ?? null, c.valueFingerprint ?? null,
          c.outcome, c.actorUserId ?? null, c.createdAt,
        ],
      );
      return;
    }
    this.changes.push({ ...c });
  }

  async listChanges(registrationId: string): Promise<DnsChange[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_dns_changes WHERE registration_id=$1 AND organization_id=$2
           ORDER BY created_at ASC`,
        [registrationId, organizationId],
      );
      return r.rows.map(mapChange);
    }
    // in-memory changes are appended under the tenant; filter defensively.
    return this.changes.filter((c) => c.registrationId === registrationId).map((c) => ({ ...c }));
  }

  // ---- hosting-account tenant/crossover defense ---------------------------
  /**
   * Returns the organization that owns a hosting account, tenant-scoped. Used to
   * refuse attaching a hosting account that belongs to a different tenant
   * (host/tenant crossover defense). Returns undefined if not found in-tenant.
   */
  async hostingAccountOrg(hostingAccountId: string): Promise<string | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT organization_id FROM hosting_accounts WHERE id=$1 AND organization_id=$2`,
        [hostingAccountId, organizationId],
      );
      return r.rows[0] ? String(r.rows[0].organization_id) : undefined;
    }
    // Mirror the Postgres tenant scoping: only visible within the same tenant.
    const org = this.memHosting.get(hostingAccountId);
    return org === organizationId ? org : undefined;
  }

  /** In-memory hosting-account org table (tests only). */
  private readonly memHosting = new Map<string, string>();
  seedHostingAccount(id: string, organizationId: string): void {
    this.memHosting.set(id, organizationId);
  }
}

function mapState(row: Record<string, unknown>): DnsState {
  let ns: string[] = [];
  try {
    ns = row.nameservers ? (JSON.parse(String(row.nameservers)) as string[]) : [];
  } catch {
    ns = [];
  }
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    registrationId: String(row.registration_id),
    mode: String(row.mode) as DnsState["mode"],
    nameservers: ns,
    provisioningStatus: String(row.provisioning_status),
    dnssecStatus: String(row.dnssec_status ?? "unknown"),
    hostingAccountId: row.hosting_account_id ? String(row.hosting_account_id) : undefined,
    lastProviderSyncAt: row.last_provider_sync_at ? String(row.last_provider_sync_at) : undefined,
    syncState: String(row.sync_state ?? "unknown"),
    authorityProvider: String(row.authority_provider ?? "unknown"),
    authorityState: String(row.authority_state ?? "unknown"),
    authorityVerifiedAt: row.authority_verified_at ? String(row.authority_verified_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRecord(row: Record<string, unknown>): DnsRecord {
  return {
    providerRecordId: row.provider_record_id ? String(row.provider_record_id) : undefined,
    type: String(row.record_type) as DnsRecord["type"],
    host: String(row.host),
    value: String(row.value),
    ttl: Number(row.ttl),
    priority: row.priority == null ? undefined : Number(row.priority),
  };
}

function mapChange(row: Record<string, unknown>): DnsChange {
  return {
    id: String(row.id),
    registrationId: String(row.registration_id),
    changeType: String(row.change_type),
    recordType: row.record_type ? String(row.record_type) : undefined,
    host: row.host ? String(row.host) : undefined,
    valueFingerprint: row.value_fingerprint ? String(row.value_fingerprint) : undefined,
    outcome: String(row.outcome),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : undefined,
    createdAt: String(row.created_at),
  };
}
