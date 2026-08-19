/**
 * Persistence for the domain purchase saga (orders + refunds). Tenant-scoped,
 * fail-closed, dual-mode (Postgres or in-memory). Workers claim work with a
 * short lease (`FOR UPDATE SKIP LOCKED` on Postgres) so multiple workers and
 * restarts converge without duplicate side effects. Every state change is a
 * small, idempotent update.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type {
  PaymentState,
  RefundState,
  RegistrarState,
  SagaStatus,
} from "./domainSagaState";

export interface SagaOrder {
  id: string;
  organizationId: string;
  userId?: string;
  quoteId?: string;
  asciiDomain: string;
  tld: string;
  years: number;
  provider: string;
  currency: string;
  customerPriceMinor: number;
  providerCostMinor: number;
  isPremium: boolean;
  status: SagaStatus;
  paymentState: PaymentState;
  registrarState: RegistrarState;
  refundState: RefundState;
  idempotencyKey: string;
  stripeCheckoutId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  chargedMinor?: number;
  termsAcceptanceId?: string;
  contactRef?: string;
  providerCorrelationId?: string;
  reason?: string;
  attempts: number;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  capturedAt?: string;
  registeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SagaRefund {
  id: string;
  organizationId: string;
  orderId: string;
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

const LEASE_MS = 60_000;

export class DomainSagaRepository extends TenantScopedRepository {
  private readonly orders = new Map<string, SagaOrder>();
  private readonly refunds = new Map<string, SagaRefund>();
  private readonly attempts: {
    organizationId: string;
    operation: string;
    outcome: string;
  }[] = [];

  constructor(db?: PgQueryable) {
    super(db);
  }

  // ---- orders -------------------------------------------------------------
  async createOrder(o: Omit<SagaOrder, "organizationId">): Promise<SagaOrder> {
    const organizationId = this.tenantId();
    const full: SagaOrder = { ...o, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_orders
           (id, organization_id, user_id, quote_id, ascii_domain, unicode_domain,
            tld, is_premium, years, provider, currency, provider_cost_minor,
            markup_minor, customer_price_minor, pricing_version, status,
            payment_state, registrar_state, refund_state, idempotency_key,
            attempts, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,$14,$15,$16,$17,$18,0,$19,$19)`,
        [
          full.id, organizationId, full.userId ?? null, full.quoteId ?? null,
          full.asciiDomain, full.tld, full.isPremium, full.years, full.provider,
          full.currency, full.providerCostMinor,
          full.customerPriceMinor - full.providerCostMinor, full.customerPriceMinor,
          full.status, full.paymentState, full.registrarState, full.refundState,
          full.idempotencyKey, full.createdAt,
        ],
      );
    } else {
      this.orders.set(full.id, full);
    }
    return full;
  }

  async getOrder(id: string): Promise<SagaOrder | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_orders WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
    }
    const o = this.orders.get(id);
    return o && o.organizationId === organizationId ? o : undefined;
  }

  /** Cross-tenant-safe lookup by the Stripe checkout id (webhook binding). */
  async getOrderByCheckoutId(checkoutId: string): Promise<SagaOrder | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_orders WHERE stripe_checkout_id = $1`,
        [checkoutId],
      );
      return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
    }
    for (const o of this.orders.values()) {
      if (o.stripeCheckoutId === checkoutId) return o;
    }
    return undefined;
  }

  async updateOrder(id: string, patch: Partial<SagaOrder>): Promise<SagaOrder> {
    const cur = this.db ? await this.getOrderUnsafe(id) : this.orders.get(id);
    if (!cur) throw new Error("order not found");
    const next: SagaOrder = { ...cur, ...patch, updatedAt: patch.updatedAt ?? cur.updatedAt };
    if (this.db) {
      await this.db.query(
        `UPDATE domain_orders SET status=$1, payment_state=$2, registrar_state=$3,
           refund_state=$4, stripe_checkout_id=$5, stripe_payment_intent_id=$6,
           stripe_charge_id=$7, charged_minor=$8, terms_acceptance_id=$9,
           contact_ref=$10, provider_correlation_id=$11, reason=$12, attempts=$13,
           next_attempt_at=$14, lease_owner=$15, lease_until=$16, captured_at=$17,
           registered_at=$18, updated_at=$19
         WHERE id=$20`,
        [
          next.status, next.paymentState, next.registrarState, next.refundState,
          next.stripeCheckoutId ?? null, next.stripePaymentIntentId ?? null,
          next.stripeChargeId ?? null, next.chargedMinor ?? null,
          next.termsAcceptanceId ?? null, next.contactRef ?? null,
          next.providerCorrelationId ?? null, next.reason ?? null, next.attempts,
          next.nextAttemptAt ?? null, next.leaseOwner ?? null,
          next.leaseUntil ?? null, next.capturedAt ?? null,
          next.registeredAt ?? null, next.updatedAt, id,
        ],
      );
    } else {
      this.orders.set(id, next);
    }
    return next;
  }

  private async getOrderUnsafe(id: string): Promise<SagaOrder | undefined> {
    const r = await this.db!.query(`SELECT * FROM domain_orders WHERE id=$1`, [id]);
    return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
  }

  /** Claims fulfillment-queued orders (lease). In-memory returns due ones. */
  async claimFulfillment(owner: string, nowIso: string, limit = 5): Promise<SagaOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_orders SET status='registering', registrar_state='registering',
           lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_orders
             WHERE status='fulfillment_queued'
               AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    const due = [...this.orders.values()].filter(
      (o) => o.status === "fulfillment_queued" &&
        (!o.nextAttemptAt || o.nextAttemptAt <= nowIso),
    ).slice(0, limit);
    for (const o of due) {
      o.status = "registering";
      o.registrarState = "registering";
      o.leaseOwner = owner;
      o.leaseUntil = until;
    }
    return due;
  }

  // ---- refunds ------------------------------------------------------------
  async createRefund(r: Omit<SagaRefund, "organizationId">): Promise<SagaRefund> {
    const organizationId = this.tenantId();
    const full: SagaRefund = { ...r, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_refunds
           (id, organization_id, order_id, stripe_charge_id, amount_minor,
            currency, reason, state, idempotency_key, attempts, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$10)
         ON CONFLICT (order_id) DO NOTHING`,
        [
          full.id, organizationId, full.orderId, full.stripeChargeId ?? null,
          full.amountMinor, full.currency, full.reason, full.state,
          full.idempotencyKey, full.createdAt,
        ],
      );
      return (await this.getRefundByOrder(full.orderId)) ?? full;
    }
    // idempotent: one per order
    for (const x of this.refunds.values()) if (x.orderId === full.orderId) return x;
    this.refunds.set(full.id, full);
    return full;
  }

  async getRefundByOrder(orderId: string): Promise<SagaRefund | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_refunds WHERE order_id=$1 AND organization_id=$2`,
        [orderId, organizationId],
      );
      return r.rows[0] ? mapRefund(r.rows[0]) : undefined;
    }
    for (const x of this.refunds.values()) {
      if (x.orderId === orderId && x.organizationId === organizationId) return x;
    }
    return undefined;
  }

  async updateRefund(id: string, patch: Partial<SagaRefund>): Promise<void> {
    if (this.db) {
      const r = await this.db.query(`SELECT * FROM domain_refunds WHERE id=$1`, [id]);
      if (!r.rows[0]) return;
      const next = { ...mapRefund(r.rows[0]), ...patch };
      await this.db.query(
        `UPDATE domain_refunds SET state=$1, stripe_refund_id=$2, attempts=$3,
           next_attempt_at=$4, lease_owner=$5, lease_until=$6, updated_at=$7 WHERE id=$8`,
        [
          next.state, next.stripeRefundId ?? null, next.attempts,
          next.nextAttemptAt ?? null, next.leaseOwner ?? null,
          next.leaseUntil ?? null, next.updatedAt, id,
        ],
      );
      return;
    }
    const cur = this.refunds.get(id);
    if (cur) this.refunds.set(id, { ...cur, ...patch });
  }

  async claimRefunds(owner: string, nowIso: string, limit = 5): Promise<SagaRefund[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_refunds SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_refunds
             WHERE state IN ('queued','pending')
               AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapRefund);
    }
    return [...this.refunds.values()].filter(
      (x) => (x.state === "queued" || x.state === "pending") &&
        (!x.nextAttemptAt || x.nextAttemptAt <= nowIso),
    ).slice(0, limit);
  }

  // ---- Stage 7: crash recovery + reconciliation claiming + attempt audit ----

  /**
   * Recovers orders stuck in `registering` with an EXPIRED lease (a worker
   * crashed mid-registration). The registrar MAY have acted, so the outcome is
   * ambiguous → `registration_unknown` (never re-registered).
   */
  async recoverExpiredFulfillment(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_orders
           SET status='registration_unknown', registrar_state='unknown',
               reason='crash_lease_recovery', lease_owner=NULL, lease_until=NULL,
               updated_at=$1
         WHERE status='registering' AND lease_until IS NOT NULL AND lease_until < $1`,
        [nowIso],
      );
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const o of this.orders.values()) {
      if (o.status === "registering" && o.leaseUntil && o.leaseUntil < nowIso) {
        o.status = "registration_unknown";
        o.registrarState = "unknown";
        o.reason = "crash_lease_recovery";
        o.leaseOwner = undefined;
        o.leaseUntil = undefined;
        n++;
      }
    }
    return n;
  }

  /** Claims aged `registration_unknown` orders for read-only reconciliation. */
  async claimUnknownForReconcile(owner: string, nowIso: string, limit = 5): Promise<SagaOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_orders SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_orders
             WHERE status='registration_unknown'
               AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    return [...this.orders.values()].filter(
      (o) => o.status === "registration_unknown" &&
        (!o.nextAttemptAt || o.nextAttemptAt <= nowIso),
    ).slice(0, limit);
  }

  /** Append-only provider-attempt record (compact ids + enums only, no PII). */
  async appendProviderAttempt(a: {
    id: string;
    orderId?: string;
    registrationId?: string;
    operation: string;
    outcome: string;
    attemptNo: number;
    errorCategory?: string;
    providerCorrelationId?: string;
    createdAt: string;
  }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_provider_attempts
           (id, organization_id, order_id, registration_id, operation, outcome,
            attempt_no, error_category, provider_correlation_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          a.id, organizationId, a.orderId ?? null, a.registrationId ?? null,
          a.operation, a.outcome, a.attemptNo, a.errorCategory ?? null,
          a.providerCorrelationId ?? null, a.createdAt,
        ],
      );
    } else {
      this.attempts.push({ organizationId, operation: a.operation, outcome: a.outcome });
    }
  }

  /** Test/inspection accessor for the in-memory attempt log. */
  listAttempts(): { operation: string; outcome: string }[] {
    return this.attempts.map((a) => ({ operation: a.operation, outcome: a.outcome }));
  }
}

function mapOrder(row: Record<string, unknown>): SagaOrder {
  const n = (v: unknown) => (v == null ? undefined : Number(v));
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    quoteId: row.quote_id ? String(row.quote_id) : undefined,
    asciiDomain: String(row.ascii_domain),
    tld: String(row.tld),
    years: Number(row.years),
    provider: String(row.provider),
    currency: String(row.currency),
    customerPriceMinor: Number(row.customer_price_minor),
    providerCostMinor: Number(row.provider_cost_minor),
    isPremium: Boolean(row.is_premium),
    status: String(row.status) as SagaStatus,
    paymentState: String(row.payment_state) as PaymentState,
    registrarState: String(row.registrar_state) as RegistrarState,
    refundState: String(row.refund_state) as RefundState,
    idempotencyKey: String(row.idempotency_key),
    stripeCheckoutId: row.stripe_checkout_id ? String(row.stripe_checkout_id) : undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id ? String(row.stripe_payment_intent_id) : undefined,
    stripeChargeId: row.stripe_charge_id ? String(row.stripe_charge_id) : undefined,
    chargedMinor: n(row.charged_minor),
    termsAcceptanceId: row.terms_acceptance_id ? String(row.terms_acceptance_id) : undefined,
    contactRef: row.contact_ref ? String(row.contact_ref) : undefined,
    providerCorrelationId: row.provider_correlation_id ? String(row.provider_correlation_id) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
    capturedAt: row.captured_at ? String(row.captured_at) : undefined,
    registeredAt: row.registered_at ? String(row.registered_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRefund(row: Record<string, unknown>): SagaRefund {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    orderId: String(row.order_id),
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
