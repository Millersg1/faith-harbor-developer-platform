import { randomUUID } from "node:crypto";

import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";

/**
 * A durable, tenant-scoped record of an affirmative marketing-consent event.
 * Stores the exact wording/version + minimal evidence (ip hash, source, form).
 * Never stores raw IPs or tokens. `confirmedAt` is set when double-opt-in is
 * confirmed; until then a `doubleOptIn` consent is pending confirmation.
 */
export interface MarketingConsentRecord {
  id: string;
  organizationId: string;
  email: string;
  formId: string | null;
  granted: boolean;
  wording: string | null;
  version: string | null;
  source: string | null;
  ipHash: string | null;
  doubleOptIn: boolean;
  confirmedAt: string | null;
  createdAt: string;
}

export interface RecordConsentInput {
  email: string;
  formId?: string | null;
  wording?: string;
  version?: string;
  source?: string;
  ipHash?: string;
  doubleOptIn?: boolean;
  /** When true, consent is immediately confirmed (single opt-in). */
  confirmed?: boolean;
  now?: string;
}

interface Row {
  id: string;
  organization_id: string;
  email: string;
  form_id: string | null;
  granted: boolean;
  wording: string | null;
  version: string | null;
  source: string | null;
  ip_hash: string | null;
  double_opt_in: boolean;
  confirmed_at: string | null;
  created_at: string;
}

export class MarketingConsentRepository extends TenantScopedRepository {
  private readonly memory: MarketingConsentRecord[] = [];

  async create(
    rec: Omit<MarketingConsentRecord, "organizationId">,
  ): Promise<MarketingConsentRecord> {
    const organizationId = this.tenantId();
    const full: MarketingConsentRecord = { ...rec, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO marketing_consents
           (id, organization_id, email, form_id, granted, wording, version,
            source, ip_hash, double_opt_in, confirmed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          full.id, full.organizationId, full.email.toLowerCase(), full.formId,
          full.granted, full.wording, full.version, full.source, full.ipHash,
          full.doubleOptIn, full.confirmedAt, full.createdAt,
        ],
      );
      return full;
    }
    this.memory.push(full);
    return full;
  }

  /** Most-recent consent record for an email in THIS tenant (case-insensitive). */
  async latestForEmail(
    email: string,
  ): Promise<MarketingConsentRecord | undefined> {
    const organizationId = this.tenantId();
    const e = email.trim().toLowerCase();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_consents
           WHERE organization_id = $1 AND LOWER(email) = $2
           ORDER BY created_at DESC LIMIT 1`,
        [organizationId, e],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    return this.memory
      .filter(
        (c) =>
          c.organizationId === organizationId &&
          c.email.toLowerCase() === e,
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  }

  async countForEmail(email: string): Promise<number> {
    const organizationId = this.tenantId();
    const e = email.trim().toLowerCase();
    if (this.db) {
      const r = await this.db.query(
        `SELECT COUNT(*)::int AS n FROM marketing_consents
           WHERE organization_id = $1 AND LOWER(email) = $2`,
        [organizationId, e],
      );
      return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0);
    }
    return this.memory.filter(
      (c) => c.organizationId === organizationId && c.email.toLowerCase() === e,
    ).length;
  }

  async markConfirmed(id: string, at: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE marketing_consents SET confirmed_at = $3
           WHERE id = $1 AND organization_id = $2`,
        [id, organizationId, at],
      );
      return;
    }
    const rec = this.memory.find(
      (c) => c.id === id && c.organizationId === organizationId,
    );
    if (rec) rec.confirmedAt = at;
  }
}

function mapRow(row: Row): MarketingConsentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    formId: row.form_id,
    granted: Boolean(row.granted),
    wording: row.wording,
    version: row.version,
    source: row.source,
    ipHash: row.ip_hash,
    doubleOptIn: Boolean(row.double_opt_in),
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  };
}

/**
 * Records and reads affirmative marketing consent. Tenant-scoped; a consent
 * event in one tenant is never visible to another. Recording is best-effort at
 * the call site (a consent hiccup must not break the submission), but the caller
 * decides — this service simply persists.
 */
export class MarketingConsentService {
  constructor(
    private readonly repository = new MarketingConsentRepository(),
  ) {}

  async record(input: RecordConsentInput): Promise<MarketingConsentRecord> {
    const now = input.now ?? new Date().toISOString();
    const doubleOptIn = input.doubleOptIn ?? false;
    return this.repository.create({
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      formId: input.formId ?? null,
      granted: true,
      wording: input.wording ?? null,
      version: input.version ?? null,
      source: input.source ?? null,
      ipHash: input.ipHash ?? null,
      doubleOptIn,
      // Single opt-in (or explicitly confirmed) → confirmed now; double opt-in
      // stays pending until the confirmation click.
      confirmedAt: !doubleOptIn || input.confirmed ? now : null,
      createdAt: now,
    });
  }

  async latestForEmail(
    email: string,
  ): Promise<MarketingConsentRecord | undefined> {
    return this.repository.latestForEmail(email);
  }

  /** True iff there is a confirmed, granted consent on file for this email. */
  async hasConfirmedConsent(email: string): Promise<boolean> {
    const latest = await this.repository.latestForEmail(email);
    return Boolean(latest && latest.granted && latest.confirmedAt);
  }

  async confirm(id: string, at = new Date().toISOString()): Promise<void> {
    await this.repository.markConfirmed(id, at);
  }

  async countForEmail(email: string): Promise<number> {
    return this.repository.countForEmail(email);
  }
}
