/**
 * Persistence for the domain TRANSFER subsystem — incoming-transfer saga orders
 * (with an ENCRYPTED EPP/auth code), transfer refunds, and an append-only,
 * PII-free outgoing-transfer action audit. Tenant-scoped, fail-closed, dual-mode.
 *
 * EPP handling: the auth code is a SENSITIVE capability. It is sealed with the
 * envelope cipher under AAD bound to (organization, transfer-order, "epp"), is
 * NEVER logged/audited/returned to callers, and is DESTROYED (ciphertext set to
 * NULL) once the submission has been attempted or the order reaches a terminal
 * state — whichever comes first (we never resubmit, so the code is single-use).
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type { EnvelopeCipher } from "../crypto/EnvelopeCipher";
import type {
  PaymentState,
  RefundState,
  TransferProviderState,
  TransferStatus,
} from "./transferSagaState";

export interface TransferOrder {
  id: string;
  organizationId: string;
  registrationId?: string; // set only once the transfer completes
  userId?: string;
  asciiDomain: string;
  tld: string;
  provider: string;
  currency: string;
  providerCostMinor: number;
  customerPriceMinor: number;
  pricingVersion: number;
  termsAcceptanceId?: string;
  status: TransferStatus;
  paymentState: PaymentState;
  transferState: TransferProviderState;
  refundState: RefundState;
  idempotencyKey: string;
  stripeCheckoutId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  chargedMinor?: number;
  providerCorrelationId?: string;
  preserveNameservers: boolean;
  attempts: number;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  reason?: string;
  capturedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** True while the encrypted EPP is still held (before destruction). */
  hasEpp?: boolean;
}

export interface TransferRefund {
  id: string;
  organizationId: string;
  transferOrderId: string;
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

export class DuplicateTransferError extends Error {
  constructor(domain: string) {
    super(`An active incoming transfer already exists for ${domain}.`);
    this.name = "DuplicateTransferError";
  }
}

const LEASE_MS = 60_000;
const ACTIVE: TransferStatus[] = [
  "quote_ready", "checkout_created", "awaiting_payment", "payment_captured",
  "transfer_submitting", "transfer_pending", "transfer_unknown", "transfer_completed",
];

export class DomainTransferRepository extends TenantScopedRepository {
  private readonly orders = new Map<string, TransferOrder & { epp?: string }>();
  private readonly refunds = new Map<string, TransferRefund>();
  private readonly outgoing: {
    id: string; organizationId: string; registrationId: string; action: string;
    outcome: string; codeDelivery?: string; actorUserId?: string; createdAt: string;
  }[] = [];
  private readonly attempts: { organizationId: string; operation: string; outcome: string }[] = [];

  constructor(db: PgQueryable | undefined, private readonly cipher: EnvelopeCipher) {
    super(db);
  }

  private eppCtx(orderId: string) {
    return { organizationId: this.tenantId(), recordId: orderId, fieldType: "epp" };
  }

  // ---- incoming orders ----------------------------------------------------
  async createIncoming(o: Omit<TransferOrder, "organizationId" | "hasEpp">, epp: string): Promise<TransferOrder> {
    const organizationId = this.tenantId();
    const full: TransferOrder = { ...o, organizationId };
    const ciphertext = this.cipher.encrypt(epp, { organizationId, recordId: full.id, fieldType: "epp" });
    if (this.db) {
      try {
        await this.db.query(
          `INSERT INTO domain_transfer_orders
             (id, organization_id, user_id, ascii_domain, tld, provider, currency,
              provider_cost_minor, markup_minor, customer_price_minor, pricing_version,
              terms_acceptance_id, epp_ciphertext, status, payment_state, transfer_state,
              refund_state, idempotency_key, preserve_nameservers, attempts, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,$20,$20)`,
          [
            full.id, organizationId, full.userId ?? null, full.asciiDomain, full.tld,
            full.provider, full.currency, full.providerCostMinor,
            full.customerPriceMinor - full.providerCostMinor, full.customerPriceMinor,
            full.pricingVersion, full.termsAcceptanceId ?? null, ciphertext, full.status,
            full.paymentState, full.transferState, full.refundState, full.idempotencyKey,
            full.preserveNameservers, full.createdAt,
          ],
        );
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new DuplicateTransferError(full.asciiDomain);
        throw e;
      }
      return { ...full, hasEpp: true };
    }
    for (const x of this.orders.values()) {
      if (x.asciiDomain === full.asciiDomain && x.organizationId === organizationId && ACTIVE.includes(x.status)) {
        throw new DuplicateTransferError(full.asciiDomain);
      }
      if (x.idempotencyKey === full.idempotencyKey) throw new DuplicateTransferError(full.asciiDomain);
    }
    this.orders.set(full.id, { ...full, epp: ciphertext, hasEpp: true });
    return { ...full, hasEpp: true };
  }

  async getIncoming(id: string): Promise<TransferOrder | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT *, (epp_ciphertext IS NOT NULL) AS has_epp FROM domain_transfer_orders WHERE id=$1 AND organization_id=$2`,
        [id, organizationId],
      );
      return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
    }
    const o = this.orders.get(id);
    if (!o || o.organizationId !== organizationId) return undefined;
    return stripEpp(o);
  }

  async getIncomingByCheckoutId(checkoutId: string): Promise<TransferOrder | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT *, (epp_ciphertext IS NOT NULL) AS has_epp FROM domain_transfer_orders WHERE stripe_checkout_id=$1`,
        [checkoutId],
      );
      return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
    }
    for (const o of this.orders.values()) if (o.stripeCheckoutId === checkoutId) return stripEpp(o);
    return undefined;
  }

  async updateIncoming(id: string, patch: Partial<TransferOrder>): Promise<TransferOrder> {
    const cur = this.db ? await this.getIncomingUnsafe(id) : this.orders.get(id);
    if (!cur) throw new Error("transfer order not found");
    const next = { ...cur, ...patch, updatedAt: patch.updatedAt ?? cur.updatedAt } as TransferOrder & { epp?: string };
    if (this.db) {
      await this.db.query(
        `UPDATE domain_transfer_orders SET status=$1, payment_state=$2, transfer_state=$3,
           refund_state=$4, registration_id=$5, stripe_checkout_id=$6, stripe_payment_intent_id=$7,
           stripe_charge_id=$8, charged_minor=$9, provider_correlation_id=$10, reason=$11,
           attempts=$12, next_attempt_at=$13, lease_owner=$14, lease_until=$15, captured_at=$16,
           submitted_at=$17, completed_at=$18, updated_at=$19 WHERE id=$20`,
        [
          next.status, next.paymentState, next.transferState, next.refundState,
          next.registrationId ?? null, next.stripeCheckoutId ?? null, next.stripePaymentIntentId ?? null,
          next.stripeChargeId ?? null, next.chargedMinor ?? null, next.providerCorrelationId ?? null,
          next.reason ?? null, next.attempts, next.nextAttemptAt ?? null, next.leaseOwner ?? null,
          next.leaseUntil ?? null, next.capturedAt ?? null, next.submittedAt ?? null,
          next.completedAt ?? null, next.updatedAt, id,
        ],
      );
    } else {
      this.orders.set(id, next);
    }
    return stripEpp(next);
  }

  private async getIncomingUnsafe(id: string): Promise<TransferOrder | undefined> {
    const r = await this.db!.query(
      `SELECT *, (epp_ciphertext IS NOT NULL) AS has_epp FROM domain_transfer_orders WHERE id=$1`, [id],
    );
    return r.rows[0] ? mapOrder(r.rows[0]) : undefined;
  }

  /** Decrypts the EPP for a SINGLE submission. Saga-only; never returned to UI. */
  async getEppForSubmission(id: string): Promise<string | undefined> {
    if (this.db) {
      const r = await this.db.query(`SELECT epp_ciphertext FROM domain_transfer_orders WHERE id=$1 AND organization_id=$2`, [id, this.tenantId()]);
      const ct = r.rows[0]?.epp_ciphertext;
      return ct ? this.cipher.decrypt(String(ct), this.eppCtx(id)) : undefined;
    }
    const o = this.orders.get(id);
    return o?.epp ? this.cipher.decrypt(o.epp, this.eppCtx(id)) : undefined;
  }

  /** Destroys the stored EPP ciphertext (single-use; never resubmitted). */
  async destroyEpp(id: string): Promise<void> {
    if (this.db) {
      await this.db.query(`UPDATE domain_transfer_orders SET epp_ciphertext=NULL, updated_at=updated_at WHERE id=$1 AND organization_id=$2`, [id, this.tenantId()]);
      return;
    }
    const o = this.orders.get(id);
    if (o) { delete o.epp; o.hasEpp = false; }
  }

  async claimForSubmit(owner: string, nowIso: string, limit = 5): Promise<TransferOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_transfer_orders SET status='transfer_submitting', transfer_state='submitting',
           lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_transfer_orders
             WHERE status='payment_captured' AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *, (epp_ciphertext IS NOT NULL) AS has_epp`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    const due = [...this.orders.values()].filter((o) => o.status === "payment_captured" && (!o.nextAttemptAt || o.nextAttemptAt <= nowIso)).slice(0, limit);
    for (const o of due) { o.status = "transfer_submitting"; o.transferState = "submitting"; o.leaseOwner = owner; o.leaseUntil = until; }
    return due.map(stripEpp);
  }

  async claimPending(owner: string, nowIso: string, limit = 5): Promise<TransferOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_transfer_orders SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_transfer_orders
             WHERE status='transfer_pending' AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *, (epp_ciphertext IS NOT NULL) AS has_epp`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    const due = [...this.orders.values()].filter((o) => o.status === "transfer_pending" && (!o.nextAttemptAt || o.nextAttemptAt <= nowIso)).slice(0, limit);
    for (const o of due) { o.leaseOwner = owner; o.leaseUntil = until; }
    return due.map(stripEpp);
  }

  async recoverExpiredSubmit(nowIso: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_transfer_orders SET status='transfer_unknown', transfer_state='unknown',
           reason='crash_lease_recovery', lease_owner=NULL, lease_until=NULL, updated_at=$1
         WHERE status='transfer_submitting' AND lease_until IS NOT NULL AND lease_until < $1`,
        [nowIso],
      );
      return r.rowCount ?? 0;
    }
    let n = 0;
    for (const o of this.orders.values()) {
      if (o.status === "transfer_submitting" && o.leaseUntil && o.leaseUntil < nowIso) {
        o.status = "transfer_unknown"; o.transferState = "unknown"; o.reason = "crash_lease_recovery";
        o.leaseOwner = undefined; o.leaseUntil = undefined; n++;
      }
    }
    return n;
  }

  async claimUnknownForReconcile(owner: string, nowIso: string, limit = 5): Promise<TransferOrder[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_transfer_orders SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_transfer_orders
             WHERE status='transfer_unknown' AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *, (epp_ciphertext IS NOT NULL) AS has_epp`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapOrder);
    }
    return [...this.orders.values()].filter((o) => o.status === "transfer_unknown" && (!o.nextAttemptAt || o.nextAttemptAt <= nowIso)).slice(0, limit).map(stripEpp);
  }

  // ---- refunds ------------------------------------------------------------
  async createRefund(r: Omit<TransferRefund, "organizationId">): Promise<TransferRefund> {
    const organizationId = this.tenantId();
    const full: TransferRefund = { ...r, organizationId };
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_transfer_refunds
           (id, organization_id, transfer_order_id, stripe_charge_id, amount_minor, currency,
            reason, state, idempotency_key, attempts, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$10) ON CONFLICT (transfer_order_id) DO NOTHING`,
        [full.id, organizationId, full.transferOrderId, full.stripeChargeId ?? null, full.amountMinor, full.currency, full.reason, full.state, full.idempotencyKey, full.createdAt],
      );
      return (await this.getRefundByOrder(full.transferOrderId)) ?? full;
    }
    for (const x of this.refunds.values()) if (x.transferOrderId === full.transferOrderId) return x;
    this.refunds.set(full.id, full);
    return full;
  }

  async getRefundByOrder(transferOrderId: string): Promise<TransferRefund | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(`SELECT * FROM domain_transfer_refunds WHERE transfer_order_id=$1 AND organization_id=$2`, [transferOrderId, organizationId]);
      return r.rows[0] ? mapRefund(r.rows[0]) : undefined;
    }
    for (const x of this.refunds.values()) if (x.transferOrderId === transferOrderId && x.organizationId === organizationId) return x;
    return undefined;
  }

  async updateRefund(id: string, patch: Partial<TransferRefund>): Promise<void> {
    if (this.db) {
      const r = await this.db.query(`SELECT * FROM domain_transfer_refunds WHERE id=$1`, [id]);
      if (!r.rows[0]) return;
      const next = { ...mapRefund(r.rows[0]), ...patch };
      await this.db.query(
        `UPDATE domain_transfer_refunds SET state=$1, stripe_refund_id=$2, attempts=$3, next_attempt_at=$4,
           lease_owner=$5, lease_until=$6, updated_at=$7 WHERE id=$8`,
        [next.state, next.stripeRefundId ?? null, next.attempts, next.nextAttemptAt ?? null, next.leaseOwner ?? null, next.leaseUntil ?? null, next.updatedAt, id],
      );
      return;
    }
    const cur = this.refunds.get(id);
    if (cur) this.refunds.set(id, { ...cur, ...patch });
  }

  async claimRefunds(owner: string, nowIso: string, limit = 5): Promise<TransferRefund[]> {
    const until = new Date(Date.parse(nowIso) + LEASE_MS).toISOString();
    if (this.db) {
      const r = await this.db.query(
        `UPDATE domain_transfer_refunds SET lease_owner=$1, lease_until=$2, updated_at=$2
         WHERE id IN (
           SELECT id FROM domain_transfer_refunds
             WHERE state IN ('queued','pending') AND (next_attempt_at IS NULL OR next_attempt_at <= $3)
             ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
        [owner, until, nowIso, limit],
      );
      return r.rows.map(mapRefund);
    }
    return [...this.refunds.values()].filter((x) => (x.state === "queued" || x.state === "pending") && (!x.nextAttemptAt || x.nextAttemptAt <= nowIso)).slice(0, limit);
  }

  // ---- attempts + outgoing audit (ids + enums only, no PII, no code) ------
  async appendAttempt(a: { id: string; transferOrderId?: string; operation: string; outcome: string; attemptNo: number; errorCategory?: string; providerCorrelationId?: string; createdAt: string }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_provider_attempts (id, organization_id, transfer_order_id, operation, outcome, attempt_no, error_category, provider_correlation_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [a.id, organizationId, a.transferOrderId ?? null, a.operation, a.outcome, a.attemptNo, a.errorCategory ?? null, a.providerCorrelationId ?? null, a.createdAt],
      );
      return;
    }
    this.attempts.push({ organizationId, operation: a.operation, outcome: a.outcome });
  }

  listAttempts(): { operation: string; outcome: string }[] {
    return this.attempts.map((a) => ({ operation: a.operation, outcome: a.outcome }));
  }

  async appendOutgoingAction(a: { id: string; registrationId: string; action: string; outcome: string; codeDelivery?: string; actorUserId?: string; createdAt: string }): Promise<void> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_outgoing_transfer_actions (id, organization_id, registration_id, action, outcome, code_delivery, actor_user_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [a.id, organizationId, a.registrationId, a.action, a.outcome, a.codeDelivery ?? null, a.actorUserId ?? null, a.createdAt],
      );
      return;
    }
    this.outgoing.push({ id: a.id, organizationId, registrationId: a.registrationId, action: a.action, outcome: a.outcome, codeDelivery: a.codeDelivery, actorUserId: a.actorUserId, createdAt: a.createdAt });
  }

  async listOutgoingActions(registrationId: string): Promise<{ action: string; outcome: string; codeDelivery?: string }[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(`SELECT action, outcome, code_delivery FROM domain_outgoing_transfer_actions WHERE registration_id=$1 AND organization_id=$2 ORDER BY created_at ASC`, [registrationId, organizationId]);
      return r.rows.map((x) => ({ action: String(x.action), outcome: String(x.outcome), codeDelivery: x.code_delivery ? String(x.code_delivery) : undefined }));
    }
    return this.outgoing.filter((o) => o.registrationId === registrationId && o.organizationId === organizationId).map((o) => ({ action: o.action, outcome: o.outcome, codeDelivery: o.codeDelivery }));
  }
}

function stripEpp(o: TransferOrder & { epp?: string }): TransferOrder {
  const { epp: _epp, ...rest } = o;
  return { ...rest, hasEpp: !!o.epp || o.hasEpp };
}

function mapOrder(row: Record<string, unknown>): TransferOrder {
  const n = (v: unknown) => (v == null ? undefined : Number(v));
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    registrationId: row.registration_id ? String(row.registration_id) : undefined,
    userId: row.user_id ? String(row.user_id) : undefined,
    asciiDomain: String(row.ascii_domain),
    tld: String(row.tld),
    provider: String(row.provider),
    currency: String(row.currency),
    providerCostMinor: Number(row.provider_cost_minor),
    customerPriceMinor: Number(row.customer_price_minor),
    pricingVersion: Number(row.pricing_version),
    termsAcceptanceId: row.terms_acceptance_id ? String(row.terms_acceptance_id) : undefined,
    status: String(row.status) as TransferStatus,
    paymentState: String(row.payment_state) as PaymentState,
    transferState: String(row.transfer_state) as TransferProviderState,
    refundState: String(row.refund_state) as RefundState,
    idempotencyKey: String(row.idempotency_key),
    stripeCheckoutId: row.stripe_checkout_id ? String(row.stripe_checkout_id) : undefined,
    stripePaymentIntentId: row.stripe_payment_intent_id ? String(row.stripe_payment_intent_id) : undefined,
    stripeChargeId: row.stripe_charge_id ? String(row.stripe_charge_id) : undefined,
    chargedMinor: n(row.charged_minor),
    providerCorrelationId: row.provider_correlation_id ? String(row.provider_correlation_id) : undefined,
    preserveNameservers: Boolean(row.preserve_nameservers),
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : undefined,
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseUntil: row.lease_until ? String(row.lease_until) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    capturedAt: row.captured_at ? String(row.captured_at) : undefined,
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    hasEpp: row.has_epp == null ? undefined : Boolean(row.has_epp),
  };
}

function mapRefund(row: Record<string, unknown>): TransferRefund {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    transferOrderId: String(row.transfer_order_id),
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
