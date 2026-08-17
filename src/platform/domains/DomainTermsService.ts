/**
 * Immutable domain-registration terms-acceptance evidence, recorded before a
 * paid domain operation. Fails closed unless a domain-registration terms version
 * is actually PUBLISHED (so nothing can be "accepted" against a draft). A
 * materially-changed (newer) published version requires re-consent for FUTURE
 * purchases and never alters completed registrations. The acceptance record
 * stores only the enumerated evidence — no raw payment data, API keys, or
 * unnecessary contact PII.
 */

import type { PgQueryable } from "../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";

export class TermsNotPublishedError extends Error {
  constructor() {
    super("Domain-registration terms are not published; cannot accept.");
    this.name = "TermsNotPublishedError";
  }
}

export interface DomainTermsAcceptanceRow {
  id: string;
  organizationId: string;
  userId: string;
  orderId?: string;
  quoteId: string;
  asciiDomain: string;
  operation: string;
  years: number;
  aecTermsVersion: number;
  pricingVersion: number;
  finalPriceMinor: number;
  currency: string;
  autoRenewChoice: boolean;
  premiumAcknowledged: boolean;
  registrarAgreementRef: string;
  registrarAgreementFingerprint?: string;
  acceptedAt: string;
  source?: string;
  ip?: string;
}

export class DomainTermsAcceptanceRepository extends TenantScopedRepository {
  private readonly mem: DomainTermsAcceptanceRow[] = [];

  constructor(db?: PgQueryable) {
    super(db);
  }

  async create(row: Omit<DomainTermsAcceptanceRow, "organizationId">): Promise<DomainTermsAcceptanceRow> {
    const organizationId = this.tenantId();
    const full: DomainTermsAcceptanceRow = { ...row, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_terms_acceptances
           (id, organization_id, user_id, order_id, aec_terms_version,
            registrar_agreement_ref, registrar_agreement_fingerprint,
            pricing_version, quote_id, years, auto_renew_choice, accepted_at,
            source, ip, ascii_domain, operation, final_price_minor, currency,
            premium_acknowledged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          full.id, organizationId, full.userId, full.orderId ?? null,
          full.aecTermsVersion, full.registrarAgreementRef,
          full.registrarAgreementFingerprint ?? null, full.pricingVersion,
          full.quoteId, full.years, full.autoRenewChoice, full.acceptedAt,
          full.source ?? null, full.ip ?? null, full.asciiDomain, full.operation,
          full.finalPriceMinor, full.currency, full.premiumAcknowledged,
        ],
      );
    } else {
      this.mem.push(full);
    }
    return full;
  }

  /** Highest accepted terms version for a user in this org, or null. */
  async latestVersionForUser(userId: string): Promise<number | null> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT MAX(aec_terms_version) AS v FROM domain_terms_acceptances
           WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, userId],
      );
      const v = r.rows[0]?.v;
      return v == null ? null : Number(v);
    }
    const versions = this.mem
      .filter((x) => x.organizationId === organizationId && x.userId === userId)
      .map((x) => x.aecTermsVersion);
    return versions.length ? Math.max(...versions) : null;
  }
}

export interface DomainTermsDeps {
  repo: DomainTermsAcceptanceRepository;
  /** The currently PUBLISHED domain-registration terms version, or null. */
  publishedTermsVersion: () => number | null;
  newId: () => string;
  now: () => string;
  /** A stable reference to the incorporated registrar (NameSilo) agreement. */
  registrarAgreementRef: string;
  registrarAgreementFingerprint?: string;
}

export interface RecordAcceptanceInput {
  userId: string;
  orderId?: string;
  quoteId: string;
  asciiDomain: string;
  operation: string;
  years: number;
  pricingVersion: number;
  finalPriceMinor: number;
  currency: string;
  autoRenewChoice: boolean;
  premiumAcknowledged: boolean;
  source?: string;
  ip?: string;
}

export class DomainTermsService {
  constructor(private readonly deps: DomainTermsDeps) {}

  /** Records immutable acceptance evidence — fails closed if terms are unpublished. */
  async recordAcceptance(input: RecordAcceptanceInput): Promise<DomainTermsAcceptanceRow> {
    const version = this.deps.publishedTermsVersion();
    if (version == null) {
      throw new TermsNotPublishedError();
    }
    return this.deps.repo.create({
      id: this.deps.newId(),
      userId: input.userId,
      orderId: input.orderId,
      quoteId: input.quoteId,
      asciiDomain: input.asciiDomain,
      operation: input.operation,
      years: input.years,
      aecTermsVersion: version,
      pricingVersion: input.pricingVersion,
      finalPriceMinor: input.finalPriceMinor,
      currency: input.currency,
      autoRenewChoice: input.autoRenewChoice,
      premiumAcknowledged: input.premiumAcknowledged,
      registrarAgreementRef: this.deps.registrarAgreementRef,
      registrarAgreementFingerprint: this.deps.registrarAgreementFingerprint,
      acceptedAt: this.deps.now(),
      source: input.source,
      ip: input.ip,
    });
  }

  /** True when the user must re-consent (no acceptance, or an older version). */
  async needsReconsent(userId: string): Promise<boolean> {
    const published = this.deps.publishedTermsVersion();
    if (published == null) return true; // nothing published -> cannot proceed
    const latest = await this.deps.repo.latestVersionForUser(userId);
    return latest == null || latest < published;
  }
}
