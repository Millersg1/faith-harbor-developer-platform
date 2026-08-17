/**
 * Tenant-scoped repository for immutable domain quotes. Fail-closed: every
 * method resolves the org from context via `tenantId()` and constrains queries
 * by it. A quote is written once and only ever transitions status
 * (active → consumed | expired); its pricing fields are never rewritten.
 */

import type { PgQueryable } from "../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";

export type QuoteStatus = "active" | "consumed" | "expired";

export interface DomainQuoteRow {
  id: string;
  organizationId: string;
  asciiDomain: string;
  unicodeDomain: string;
  tld: string;
  isPremium: boolean;
  years: number;
  operation: string;
  provider: string;
  currency: string;
  providerCostMinor: number;
  markupMinor: number;
  customerPriceMinor: number;
  renewalCostMinor?: number;
  renewalPriceMinor?: number;
  transferPriceMinor?: number;
  pricingVersion: number;
  status: QuoteStatus;
  createdAt: string;
  expiresAt: string;
}

export class DomainQuoteRepository extends TenantScopedRepository {
  private readonly mem = new Map<string, DomainQuoteRow>();

  constructor(db?: PgQueryable) {
    super(db);
  }

  async create(row: Omit<DomainQuoteRow, "organizationId">): Promise<DomainQuoteRow> {
    const organizationId = this.tenantId();
    const full: DomainQuoteRow = { ...row, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_quotes
           (id, organization_id, ascii_domain, unicode_domain, tld, is_premium,
            years, operation, provider, currency, provider_cost_minor,
            markup_minor, customer_price_minor, renewal_cost_minor,
            renewal_price_minor, transfer_price_minor, pricing_version, status,
            created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          full.id, organizationId, full.asciiDomain, full.unicodeDomain, full.tld,
          full.isPremium, full.years, full.operation, full.provider, full.currency,
          full.providerCostMinor, full.markupMinor, full.customerPriceMinor,
          full.renewalCostMinor ?? null, full.renewalPriceMinor ?? null,
          full.transferPriceMinor ?? null, full.pricingVersion, full.status,
          full.createdAt, full.expiresAt,
        ],
      );
    } else {
      this.mem.set(full.id, full);
    }
    return full;
  }

  async get(id: string): Promise<DomainQuoteRow | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_quotes WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      return r.rows[0] ? mapRow(r.rows[0]) : undefined;
    }
    const row = this.mem.get(id);
    return row && row.organizationId === organizationId ? row : undefined;
  }

  async setStatus(id: string, status: QuoteStatus): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_quotes SET status = $1 WHERE id = $2 AND organization_id = $3`,
        [status, id, organizationId],
      );
      return;
    }
    const row = this.mem.get(id);
    if (row && row.organizationId === organizationId) row.status = status;
  }
}

function mapRow(row: Record<string, unknown>): DomainQuoteRow {
  const num = (v: unknown) => (v == null ? undefined : Number(v));
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    asciiDomain: String(row.ascii_domain),
    unicodeDomain: String(row.unicode_domain),
    tld: String(row.tld),
    isPremium: Boolean(row.is_premium),
    years: Number(row.years),
    operation: String(row.operation),
    provider: String(row.provider),
    currency: String(row.currency),
    providerCostMinor: Number(row.provider_cost_minor),
    markupMinor: Number(row.markup_minor),
    customerPriceMinor: Number(row.customer_price_minor),
    renewalCostMinor: num(row.renewal_cost_minor),
    renewalPriceMinor: num(row.renewal_price_minor),
    transferPriceMinor: num(row.transfer_price_minor),
    pricingVersion: Number(row.pricing_version),
    status: String(row.status) as QuoteStatus,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  };
}
