/**
 * Persistence for the domain RENEWAL saga — renewal orders, renewal refunds, and
 * per-registration auto-renew authorizations. Tenant-scoped, fail-closed,
 * dual-mode (Postgres or in-memory). Workers claim work with a short lease
 * (`FOR UPDATE SKIP LOCKED` on Postgres). A database UNIQUE constraint prevents
 * a duplicate renewal for the same (registration, expiration cycle, term); the
 * in-memory mode mirrors it.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type {
  ChargePath,
  PaymentState,
  RefundState,
  RenewalMode,
  RenewalState,
  RenewalStatus,
} from "./renewalSagaState";

export interface RenewalOrder {
  id: string;
  organizationId: string;
  registrationId: string;
  userId?: string;
  asciiDomain: string;
  tld: string;
  termYears: number;
  provider: string;
  currency: string;
  providerCostMinor: number;
  customerPriceMinor: number;
  pricingVersion: number;
  /** The expiration date being renewed — binds the order to one billing cycle. */
  currentExpiresAt: string;
  newExpiresAt?: string;
  mode: RenewalMode;
  chargePath: ChargePath;
  termsAcceptanceId?: string;
  status: RenewalStatus;
  paymentState: PaymentState;
  renewalState: RenewalState;
  refundState: RefundState;
  idempotencyKey: string;
  stripeCheckoutId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  chargedMinor?: number;
  attempts: number;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  reason?: string;
  providerCorrelationId?: string;
  capturedAt?: string;
  renewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalRefund {
  id: string;
  organizationId: string;
  renewalOrderId: string;
  stripeChargeId?: string;
  stripeRefundId?: string;
  amountMinor: number;
  currency: string;
  reason: string;
  state: RefundState;
  idempotencyKey: string;
  attempts: number;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutoRenewConsent {
  id: string;
  organizationId: string;
  registrationId: string;
  userId?: string;
  termsAcceptanceId?: string;
  pricingVersionAck?: number;
  stripeCustomerRef?: string;
  stripePaymentMethodRef?: string;
  setupIntentId?: string;
  mandateTextHash?: string;
  currency?: string;
  consentedAt: string;
  createdAt: string;
}

export interface AutoRenewAuthorization {
  registrationId: string;
  organizationId: string;
  enabled: boolean;
  authorizedByUserId?: string;
  authorizedAt?: string;
  termsAcceptanceId?: string;
  pricingVersionAck?: number;
  stripeCustomerRef?: string;
  stripePaymentMethodRef?: string;
  currency?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  nextScanAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** A registration claimed by the auto-renew scanner for eligibility processing. */
export interface DueAutoRenew {
  registrationId: string;
  organizationId: string;
  stripeCustomerRef?: string;
  stripePaymentMethodRef?: string;
  currency?: string;
}

export class DuplicateRenewalError extends Error {
  constructor(registrationId: string) {
    super(`A renewal for this registration + expiration cycle + term already exists (${registrationId}).`);
    this.name = "DuplicateRenewalError";
  }
}

const LEASE_MS = 60_000;
const ACTIVE_STATUSES: RenewalStatus[] = [
  "quote_ready", "checkout_created", "off_session_authorized", "awaiting_payment",
  "payment_captured", "renewal_queued", "renewing", "renewal_unknown", "renewed",
];

export class DomainRenewalRepository extends TenantScopedRepository {
  private readonly orders = new Map<string, RenewalOrder>();
  private readonly refunds = new Map<string, RenewalRefund>();
  private readonly autoRenew = new Map<string, AutoRenewAuthorization>();
  private readonly consents: AutoRenewConsent[] = [];
  private readonly attempts: { organizationId: string; operation: string; outcome: string }[] = [];

  constructor(db?: PgQueryable) {
    super(db);
  }

  // ---- orders -------------------------------------------------------------
  async createOrder(o: Omit<RenewalOrder, "organizationId">): Promise<RenewalOrder> {
    const organizationId = this.tenantId();
    const full: RenewalOrder = { ...o, organizationId };
    if (this.db) {
      try {
        await this.db.query(
          `INSERT INTO domain_renewal_orders
             (id, organization_id, registration_id, user_id, ascii_domain, tld,
              term_years, provider, currency, provider_cost_minor, markup_minor,
              customer_price_minor, pricing_version, current_expires_at, mode,
              charge_path, terms_acceptance_id, status, payment_state,
              renewal_state, refund_state, idempotency_key, attempts,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                   $18,$19,$20,$21,$22,0,$23,$23)`,
          [
            full.id, organizationId, full.registrationId, full.userId ?? null,
            full.asciiDomain, full.tld, full.termYears, full.provider, full.currency,
            full.providerCostMinor, full.customerPriceMinor - full.providerCostMinor,
            full.customerPriceMinor, full.pricingVersion, full.currentExpiresAt,
            full.mode, full.chargePath, full.termsAcceptanceId ?? null, full.status,
            full.paymentState, full.renewalState, full.refundState, full.idempotencyKey,
            full.createdAt,
          ],
        );
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new DuplicateRenewalError(full.registrationId);
        throw e;
      }
      return full;
    }
    // in-memory duplicate prevention (mirror the partial unique index)
    for (const x of this.orders.values()) {
      if (
        x.registrationId === full.registrationId &&
        x.currentExpiresAt === full.currentExpiresAt &&
        x.termYears === full.termYears &&
        ACTIVE_STATUSES.includes(x.status)
      ) {
        throw new DuplicateRenewalError(full.registrationId);
      }
      if (x.idempotencyKey === full.idempotencyKey) throw new DuplicateRenewalError(full.registrationId);
    }
    this.orders.set(full.id, full);
    return full;
  }

  async getOrder(id: string): Promise<RenewalOrder | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_renewal_orders WHERE id=$1 AND organization_id=$2`,
        [id, organizationId],
      );
      return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
    }
    const o = this.orders.get(id);
    return o && o.organizationId === organizationId ? o : undefined;
  }

  async getOrderByCheckoutId(checkoutId: string): Promise<RenewalOrder | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_renewal_orders WHERE stripe_checkout_id=$1`,
        [checkoutId],
      );
      return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
    }
    for (const o of this.orders.values()) if (o.stripeCheckoutId === checkoutId) return o;
    return undefined;
  }

  async updateOrder(id: string, patch: Partial<RenewalOrder>): Promise<RenewalOrder> {
    const cur = this.db ? await this.getOrderUnsafe(id) : this.orders.get(id);
    if (!cur) throw new Error("renewal order not found");
    const next: RenewalOrder = { ...cur, ...patch, updatedAt: patch.updatedAt ?? cur.updatedAt };
    if (this.db) {
      await this.db.query(
        `UPDATE domain_renewal_orders SET status=$1, payment_state=$2, renewal_state=$3,
           refund_state=$4, stripe_checkout_id=$5, stripe_payment_intent_id=$6,
           stripe_charge_id=$7, charged_minor=$8, new_expires_at=$9,
           provider_correlation_id=$10, reason=$11, attempts=$12, next_attempt_at=$13,
           lease_owner=$14, lease_until=$15, captured_at=$16, renewed_at=$17, updated_at=$18
         WHERE id=$19`,
        [
          next.status, next.paymentState, next.renewalState, next.refundState,
          next.stripeCheckoutId ?? null, next.stripePaymentIntentId ?? null,
          next.stripeChargeId ?? null, next.chargedMinor ?? null, next.newExpiresAt ?? null,
          next.providerCorrelationId ?? null, next.reason ?? null, next.attempts,
          next.nextAttemptAt ?? null, next.leaseOwner ?? null, next.leaseUntil ?? null,
          next.capturedAt ?? null, next.renewedAt ?? null, next.updatedAt, id,
        ],
      );
    } else {
      this.orders.set(id, next);
    }
    return next;
  }

  private async getOrderUnsafe(id: string): Promise<RenewalOrder | undefined> {
    const r = await this.db!.query(`SELECT * FROM domain_renewal_orders WHERE id=$1`, [id]);
    return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
  }

  async claimRenewal(owner: string, nowIso: string, limit = 5): Promise<RenewalOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_renewal_orders SET status='renewing', renewal_state='renewing',
           lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_renewal_orders
             WHERE status='renewal_queued'
               AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    const due = [...this.orders.values()].filter(
      (o) => o.status === "renewal_queued" && (!o.nextAttemptAt || o.nextAttemptAt <= nowIso),
    ).slice(0, limit);
    for (const o of due) {
      o.status = "renewing"; o.renewalState = "renewing"; o.leaseOwner = owner; o.leaseUntil = until;
    }
    return due;
  }

  async recoverExpiredRenewal(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_renewal_orders
           SET status='renewal_unknown', renewal_state='unknown', reason='crash_lease_recovery',
               lease_owner=NULL, lease_until=NULL, updated_at=$1
         WHERE status='renewing' AND lease_until IS NOT NULL AND lease_until < $1`,
        [nowIso],
      );
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const o of this.orders.values()) {
      if (o.status === "renewing" && o.leaseUntil && o.leaseUntil < nowIso) {
        o.status = "renewal_unknown"; o.renewalState = "unknown"; o.reason = "crash_lease_recovery";
        o.leaseOwner = undefined; o.leaseUntil = undefined; n++;
      }
    }
    return n;
  }

  async claimUnknownForReconcile(owner: string, nowIso: string, limit = 5): Promise<RenewalOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_renewal_orders SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_renewal_orders
             WHERE status='renewal_unknown'
               AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    return [...this.orders.values()].filter(
      (o) => o.status === "renewal_unknown" && (!o.nextAttemptAt || o.nextAttemptAt <= nowIso),
    ).slice(0, limit);
  }

  // ---- refunds ------------------------------------------------------------
  async createRefund(r: Omit<RenewalRefund, "organizationId">): Promise<RenewalRefund> {
    const organizationId = this.tenantId();
    const full: RenewalRefund = { ...r, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_renewal_refunds
           (id, organization_id, renewal_order_id, stripe_charge_id, amount_minor,
            currency, reason, state, idempotency_key, attempts, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$10)
         ON CONFLICT (renewal_order_id) DO NOTHING`,
        [
          full.id, organizationId, full.renewalOrderId, full.stripeChargeId ?? null,
          full.amountMinor, full.currency, full.reason, full.state, full.idempotencyKey,
          full.createdAt,
        ],
      );
      return (await this.getRefundByOrder(full.renewalOrderId)) ?? full;
    }
    for (const x of this.refunds.values()) if (x.renewalOrderId === full.renewalOrderId) return x;
    this.refunds.set(full.id, full);
    return full;
  }

  async getRefundByOrder(renewalOrderId: string): Promise<RenewalRefund | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_renewal_refunds WHERE renewal_order_id=$1 AND organization_id=$2`,
        [renewalOrderId, organizationId],
      );
      return r.rows[0] ? mapRefund(r.rows[0]) : undefined;
    }
    for (const x of this.refunds.values()) {
      if (x.renewalOrderId === renewalOrderId && x.organizationId === organizationId) return x;
    }
    return undefined;
  }

  async updateRefund(id: string, patch: Partial<RenewalRefund>): Promise<void> {
    if (this.db) {
      const r = await this.db.query(`SELECT * FROM domain_renewal_refunds WHERE id=$1`, [id]);
      if (!r.rows[0]) return;
      const next = { ...mapRefund(r.rows[0]), ...patch };
      await this.db.query(
        `UPDATE domain_renewal_refunds SET state=$1, stripe_refund_id=$2, attempts=$3,
           next_attempt_at=$4, lease_owner=$5, lease_until=$6, updated_at=$7 WHERE id=$8`,
        [
          next.state, next.stripeRefundId ?? null, next.attempts, next.nextAttemptAt ?? null,
          next.leaseOwner ?? null, next.leaseUntil ?? null, next.updatedAt, id,
        ],
      );
      return;
    }
    const cur = this.refunds.get(id);
    if (cur) this.refunds.set(id, { ...cur, ...patch });
  }

  async claimRefunds(owner: string, nowIso: string, limit = 5): Promise<RenewalRefund[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_renewal_refunds SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_renewal_refunds
             WHERE state IN ('queued','pending')
               AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapRefund);
    }
    return [...this.refunds.values()].filter(
      (x) => (x.state === "queued" || x.state === "pending") && (!x.nextAttemptAt || x.nextAttemptAt <= nowIso),
    ).slice(0, limit);
  }

  // ---- provider-attempt audit (ids + enums only, no PII) ------------------
  async appendAttempt(a: {
    id: string; renewalOrderId?: string; operation: string; outcome: string;
    attemptNo: number; errorCategory?: string; providerCorrelationId?: string; createdAt: string;
  }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_provider_attempts
           (id, organization_id, renewal_order_id, operation, outcome, attempt_no,
            error_category, provider_correlation_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          a.id, organizationId, a.renewalOrderId ?? null, a.operation, a.outcome,
          a.attemptNo, a.errorCategory ?? null, a.providerCorrelationId ?? null, a.createdAt,
        ],
      );
      return;
    }
    this.attempts.push({ organizationId, operation: a.operation, outcome: a.outcome });
  }

  listAttempts(): { operation: string; outcome: string }[] {
    return this.attempts.map((a) => ({ operation: a.operation, outcome: a.outcome }));
  }

  // ---- auto-renew authorization (opt-in, OFF by default) ------------------
  async getAutoRenew(registrationId: string): Promise<AutoRenewAuthorization | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_autorenew WHERE registration_id=$1 AND organization_id=$2`,
        [registrationId, organizationId],
      );
      return r.rows[0] ? mapAuto(r.rows[0]) : undefined;
    }
    const a = this.autoRenew.get(registrationId);
    return a && a.organizationId === organizationId ? a : undefined;
  }

  async putAutoRenew(a: Omit<AutoRenewAuthorization, "organizationId">): Promise<AutoRenewAuthorization> {
    const organizationId = this.tenantId();
    const full: AutoRenewAuthorization = { ...a, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_autorenew
           (registration_id, organization_id, enabled, authorized_by_user_id, authorized_at,
            terms_acceptance_id, pricing_version_ack, stripe_customer_ref,
            stripe_payment_method_ref, currency, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         ON CONFLICT (registration_id) DO UPDATE SET
           enabled=EXCLUDED.enabled, authorized_by_user_id=EXCLUDED.authorized_by_user_id,
           authorized_at=EXCLUDED.authorized_at, terms_acceptance_id=EXCLUDED.terms_acceptance_id,
           pricing_version_ack=EXCLUDED.pricing_version_ack,
           stripe_customer_ref=EXCLUDED.stripe_customer_ref,
           stripe_payment_method_ref=EXCLUDED.stripe_payment_method_ref,
           currency=EXCLUDED.currency, updated_at=EXCLUDED.updated_at`,
        [
          full.registrationId, organizationId, full.enabled, full.authorizedByUserId ?? null,
          full.authorizedAt ?? null, full.termsAcceptanceId ?? null, full.pricingVersionAck ?? null,
          full.stripeCustomerRef ?? null, full.stripePaymentMethodRef ?? null, full.currency ?? null,
          full.createdAt,
        ],
      );
      return (await this.getAutoRenew(full.registrationId))!;
    }
    this.autoRenew.set(full.registrationId, full);
    return full;
  }

  // ---- auto-renew SCANNER claim (SKIP LOCKED) -----------------------------
  /**
   * Claims due auto-renew authorizations with `FOR UPDATE SKIP LOCKED` so
   * concurrent scanners + restarts converge. Eligibility here is coarse (enabled
   * + a saved method + a due/expiring registration + not leased + backoff-due);
   * the scanner service re-verifies the full eligibility per item and the DB
   * `domain_renewal_active_uniq` index is the final duplicate guard.
   */
  async claimDueAutoRenew(owner: string, nowIso: string, withinIso: string, limit = 20): Promise<DueAutoRenew[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_autorenew SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE registration_id IN (
           SELECT a.registration_id
             FROM domain_autorenew a
             JOIN domain_registrations reg ON reg.id = a.registration_id
             WHERE a.enabled = TRUE
               AND a.stripe_payment_method_ref IS NOT NULL
               AND reg.status = 'active'
               AND reg.expires_at IS NOT NULL AND reg.expires_at <= $3
               AND (a.next_scan_at IS NULL OR a.next_scan_at <= $4)
               AND (a.lease_until IS NULL OR a.lease_until < $4)
             ORDER BY reg.expires_at ASC LIMIT $5
             FOR UPDATE OF a SKIP LOCKED)
         RETURNING registration_id, organization_id, stripe_customer_ref, stripe_payment_method_ref, currency`,
        [owner, until, withinIso, nowIso, limit],
      );
      return r.rows.map((x) => ({
        registrationId: String(x.registration_id),
        organizationId: String(x.organization_id),
        stripeCustomerRef: x.stripe_customer_ref ? String(x.stripe_customer_ref) : undefined,
        stripePaymentMethodRef: x.stripe_payment_method_ref ? String(x.stripe_payment_method_ref) : undefined,
        currency: x.currency ? String(x.currency) : undefined,
      }));
    }
    // In-memory: coarse lease of enabled + PM + backoff-due; the scanner filters
    // registration facts (active / within-window / fresh) itself.
    const due: DueAutoRenew[] = [];
    for (const a of this.autoRenew.values()) {
      if (due.length >= limit) break;
      if (!a.enabled || !a.stripePaymentMethodRef) continue;
      if (a.nextScanAt && a.nextScanAt > nowIso) continue;
      if (a.leaseUntil && a.leaseUntil >= nowIso) continue;
      a.leaseOwner = owner; a.leaseUntil = until;
      due.push({ registrationId: a.registrationId, organizationId: a.organizationId, stripeCustomerRef: a.stripeCustomerRef, stripePaymentMethodRef: a.stripePaymentMethodRef, currency: a.currency });
    }
    return due;
  }

  /** True if the registration has an UNRESOLVED renewal (needs_attention or
   *  renewal_unknown) — a blocking condition for a fresh auto-renewal. */
  async hasUnresolvedRenewal(registrationId: string): Promise<boolean> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT 1 FROM domain_renewal_orders
           WHERE registration_id=$1 AND organization_id=$2
             AND status IN ('needs_attention','renewal_unknown') LIMIT 1`,
        [registrationId, organizationId],
      );
      return r.rows.length > 0;
    }
    for (const o of this.orders.values()) {
      if (o.registrationId === registrationId && o.organizationId === organizationId && (o.status === "needs_attention" || o.status === "renewal_unknown")) return true;
    }
    return false;
  }

  /** Clears the scan lease + sets the next scan time (backoff / next cycle). */
  async finishAutoRenewScan(registrationId: string, nextScanAtIso: string): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE domain_autorenew SET lease_owner=NULL, lease_until=NULL, next_scan_at=$1, updated_at=$1
           WHERE registration_id=$2 AND organization_id=$3`,
        [nextScanAtIso, registrationId, organizationId],
      );
      return;
    }
    const a = this.autoRenew.get(registrationId);
    if (a && a.organizationId === organizationId) { a.leaseOwner = undefined; a.leaseUntil = undefined; a.nextScanAt = nextScanAtIso; }
  }

  /** Crash recovery: releases scan leases whose lease has expired. */
  async recoverExpiredAutoRenewLease(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_autorenew SET lease_owner=NULL, lease_until=NULL, updated_at=$1
           WHERE lease_until IS NOT NULL AND lease_until < $1`,
        [nowIso],
      );
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const a of this.autoRenew.values()) {
      if (a.leaseUntil && a.leaseUntil < nowIso) { a.leaseOwner = undefined; a.leaseUntil = undefined; n++; }
    }
    return n;
  }

  /** Appends an IMMUTABLE off-session consent-evidence record. */
  async appendConsent(c: Omit<AutoRenewConsent, "organizationId">): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_autorenew_consents
           (id, organization_id, registration_id, user_id, terms_acceptance_id,
            pricing_version_ack, stripe_customer_ref, stripe_payment_method_ref,
            setup_intent_id, mandate_text_hash, currency, consented_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          c.id, organizationId, c.registrationId, c.userId ?? null, c.termsAcceptanceId ?? null,
          c.pricingVersionAck ?? null, c.stripeCustomerRef ?? null, c.stripePaymentMethodRef ?? null,
          c.setupIntentId ?? null, c.mandateTextHash ?? null, c.currency ?? null, c.consentedAt,
        ],
      );
      return;
    }
    this.consents.push({ ...c, organizationId });
  }

  async listConsents(registrationId: string): Promise<AutoRenewConsent[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_autorenew_consents WHERE registration_id=$1 AND organization_id=$2 ORDER BY created_at ASC`,
        [registrationId, organizationId],
      );
      return r.rows.map(mapConsent);
    }
    return this.consents.filter((c) => c.registrationId === registrationId && c.organizationId === organizationId).map((c) => ({ ...c }));
  }
}

function mapConsent(row: Record<string, unknown>): AutoRenewConsent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    registrationId: String(row.registration_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    termsAcceptanceId: row.terms_acceptance_id ? String(row.terms_acceptance_id) : undefined,
    pricingVersionAck: row.pricing_version_ack == null ? undefined : Number(row.pricing_version_ack),
    stripeCustomerRef: row.stripe_customer_ref ? String(row.stripe_customer_ref) : undefined,
    stripePaymentMethodRef: row.stripe_payment_method_ref ? String(row.stripe_payment_method_ref) : undefined,
    setupIntentId: row.setup_intent_id ? String(row.setup_intent_id) : undefined,
    mandateTextHash: row.mandate_text_hash ? String(row.mandate_text_hash) : undefined,
    currency: row.currency ? String(row.currency) : undefined,
    consentedAt: String(row.consented_at),
    createdAt: String(row.created_at),
  };
}

function mapOrder(row: Record<string, unknown>): RenewalOrder {
  const n = (v: unknown) => (v == null ? undefined : Number(v));
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    registrationId: String(row.registration_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    asciiDomain: String(row.ascii_domain),
    tld: String(row.tld),
    termYears: Number(row.term_years),
    provider: String(row.provider),
    currency: String(row.currency),
    providerCostMinor: Number(row.provider_cost_minor),
    customerPriceMinor: Number(row.customer_price_minor),
    pricingVersion: Number(row.pricing_version),
    currentExpiresAt: String(row.current_expires_at),
    newExpiresAt: row.new_expires_at ? String(row.new_expires_at) : undefined,
    mode: String(row.mode) as RenewalMode,
    chargePath: String(row.charge_path) as ChargePath,
    termsAcceptanceId: row.terms_acceptance_id ? String(row.terms_acceptance_id) : undefined,
    status: String(row.status) as RenewalStatus,
    paymentState: String(row.payment_state) as PaymentState,
    renewalState: String(row.renewal_state) as RenewalState,
    refundState: String(row.refund_state) as RefundState,
    idempotencyKey: String(row.idempotency_key),
    stripeCheckoutId: row.stripe_checkout_id ? String(row.stripe_checkout_id) : undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id ? String(row.stripe_payment_intent_id) : undefined,
    stripeChargeId: row.stripe_charge_id ? String(row.stripe_charge_id) : undefined,
    chargedMinor: n(row.charged_minor),
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    providerCorrelationId: row.provider_correlation_id ? String(row.provider_correlation_id) : undefined,
    capturedAt: row.captured_at ? String(row.captured_at) : undefined,
    renewedAt: row.renewed_at ? String(row.renewed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRefund(row: Record<string, unknown>): RenewalRefund {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    renewalOrderId: String(row.renewal_order_id),
    stripeChargeId: row.stripe_charge_id ? String(row.stripe_charge_id) : undefined,
    stripeRefundId: row.stripe_refund_id ? String(row.stripe_refund_id) : undefined,
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    reason: String(row.reason),
    state: String(row.state) as RefundState,
    idempotencyKey: String(row.idempotency_key),
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAuto(row: Record<string, unknown>): AutoRenewAuthorization {
  return {
    registrationId: String(row.registration_id),
    organizationId: String(row.organization_id),
    enabled: Boolean(row.enabled),
    authorizedByUserId: row.authorized_by_user_id ? String(row.authorized_by_user_id) : undefined,
    authorizedAt: row.authorized_at ? String(row.authorized_at) : undefined,
    termsAcceptanceId: row.terms_acceptance_id ? String(row.terms_acceptance_id) : undefined,
    pricingVersionAck: row.pricing_version_ack == null ? undefined : Number(row.pricing_version_ack),
    stripeCustomerRef: row.stripe_customer_ref ? String(row.stripe_customer_ref) : undefined,
    stripePaymentMethodRef: row.stripe_payment_method_ref ? String(row.stripe_payment_method_ref) : undefined,
    currency: row.currency ? String(row.currency) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
