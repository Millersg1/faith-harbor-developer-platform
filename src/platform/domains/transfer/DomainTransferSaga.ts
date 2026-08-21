/**
 * The domain TRANSFER subsystem (Stripe TEST MODE + fake/sandbox registrar).
 *
 * INCOMING (a saga): owner-only + recent reauth, gated behind an explicit
 * sandbox flag. A fresh transfer quote + PUBLISHED transfer terms are required
 * before payment; the EPP/auth code is encrypted at rest, used once, and
 * destroyed. The transfer is submitted ONLY after confirmed capture, exactly
 * once; an ambiguous submission becomes `transfer_unknown` (no blind retry / no
 * auto-refund until read-only reconciliation). The domain's current nameservers
 * are PRESERVED — a transfer never attaches hosting, replaces DNS, or changes
 * nameservers. We never promise a bonus year; the verified provider expiry is
 * persisted on completion. Refunds are idempotent and depend on verified state.
 *
 * OUTGOING (deliberate owner actions, not a saga): unlock and auth-code request
 * are SEPARATE, individually-confirmed, owner-only + reauth actions. With
 * NameSilo the auth code is emailed to the registrant and never returned via API;
 * the platform never requests/displays/stores/logs a code the provider does not
 * return. We never obstruct a transfer-away.
 */

import { runWithTenant } from "../../../tenancy/TenantContext";
import {
  authorizeDomainAction,
  type AuthContext,
} from "../contact/contactAuthPolicy";
import type { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import {
  customerPriceMinor as computeCustomerPrice,
  ruleForPlan,
  type PricingPolicy,
} from "../pricing/PricingPolicy";
import type { DomainRegistrarProvider } from "../RegistrarProvider";
import type { DomainStripeGateway } from "../saga/DomainStripeGateway";
import { DomainTransferRepository, type TransferOrder } from "./DomainTransferRepository";
import { transferTransition, type TransferStatus } from "./transferSagaState";

export class TransferAuthError extends Error {
  constructor(reason: string) { super(`Not authorized for transfer (${reason}).`); this.name = "TransferAuthError"; }
}
export class TransferGateError extends Error {
  constructor(readonly gate: string) { super(`Transfer gate failed: ${gate}.`); this.name = "TransferGateError"; }
}
export class TransferDisabledError extends Error {
  constructor() { super("Incoming transfers are disabled (DOMAIN_INCOMING_TRANSFERS_ENABLED=false)."); this.name = "TransferDisabledError"; }
}

export interface TransferDeps {
  repo: DomainTransferRepository;
  stripe: DomainStripeGateway;
  registrar: DomainRegistrarProvider;
  registrations: DomainRegistrationRepository;
  policy: PricingPolicy;
  now: () => string;
  newId: () => string;
  successUrl: string;
  cancelUrl: string;
  /** Fail-closed feature flag; incoming transfers are off unless explicitly on. */
  incomingTransfersEnabled: boolean;
  /** The published transfer-terms version, or null when unpublished (blocks). */
  publishedTransferTermsVersion: () => number | null;
  maxAttempts?: number;
  backoffMs?: number;
  beginEvent?: (eventId: string) => Promise<boolean>;
}

export interface CreateIncomingInput {
  asciiDomain: string;
  tld: string;
  userId: string;
  planId: string;
  /** The transfer authorization (EPP) code the customer supplied. */
  eppCode: string;
  termsAcceptanceId?: string;
}

export class DomainTransferSaga {
  constructor(private readonly d: TransferDeps) {}

  private move(order: TransferOrder, to: TransferStatus): TransferStatus {
    return transferTransition(order.status, to);
  }

  // ==== INCOMING ==========================================================
  async createIncomingTransfer(input: CreateIncomingInput, auth: AuthContext): Promise<{ orderId: string; checkoutUrl: string }> {
    if (!this.d.incomingTransfersEnabled) throw new TransferDisabledError();
    const decision = authorizeDomainAction("purchase", auth); // owner-only + reauth
    if (!decision.allowed) throw new TransferAuthError(decision.reason ?? "role");
    if (!input.eppCode || input.eppCode.trim().length < 4) throw new TransferGateError("epp_required");
    if (this.d.publishedTransferTermsVersion() == null) throw new TransferGateError("transfer_terms_unpublished");

    // Fresh authoritative transfer quote (transfer price, shown separately).
    const price = await this.d.registrar.getTransferPrice(input.tld, 1);
    const rule = ruleForPlan(this.d.policy, input.planId);
    const nowIso = this.d.now();
    const orderId = this.d.newId();

    let order = await this.d.repo.createIncoming(
      {
        id: orderId,
        userId: input.userId,
        asciiDomain: input.asciiDomain,
        tld: input.tld,
        provider: "namesilo",
        currency: price.cost.currency,
        providerCostMinor: price.cost.amountMinor,
        customerPriceMinor: computeCustomerPrice(price.cost.amountMinor, rule),
        pricingVersion: this.d.policy.version,
        termsAcceptanceId: input.termsAcceptanceId,
        status: "quote_ready",
        paymentState: "none",
        transferState: "none",
        refundState: "none",
        idempotencyKey: `transfer:${orderId}`,
        preserveNameservers: true,
        attempts: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      input.eppCode, // encrypted inside the repo, never held here
    );

    order = { ...order, status: this.move(order, "checkout_created") };
    const checkout = await this.d.stripe.createOneTimeCheckout({
      orderId: order.id, organizationId: order.organizationId, userId: input.userId, quoteId: order.id,
      amountMinor: order.customerPriceMinor, currency: order.currency,
      productName: `Domain transfer: ${order.asciiDomain}`,
      successUrl: this.d.successUrl, cancelUrl: this.d.cancelUrl, idempotencyKey: `transfer-checkout:${order.id}`,
    });
    await this.d.repo.updateIncoming(order.id, {
      status: this.move({ ...order, status: "checkout_created" }, "awaiting_payment"),
      stripeCheckoutId: checkout.id, stripePaymentIntentId: `pi_test_${checkout.id}`,
      paymentState: "checkout_created", updatedAt: nowIso,
    });
    return { orderId: order.id, checkoutUrl: checkout.url };
  }

  async handleCheckoutCompleted(args: { eventId: string; rawBody: string; signature: string; checkoutId: string; paymentIntentId: string }): Promise<void> {
    if (!this.d.stripe.verifyWebhook(args.rawBody, args.signature)) throw new TransferGateError("webhook_signature");
    if (this.d.beginEvent && !(await this.d.beginEvent(args.eventId))) return;
    const order = await this.d.repo.getIncomingByCheckoutId(args.checkoutId);
    if (!order) return;
    if (order.paymentState === "captured") return;
    const pi = await this.d.stripe.getPaymentIntent(args.paymentIntentId);
    const ok = pi.status === "succeeded" && pi.amountMinor === order.customerPriceMinor && pi.currency === order.currency;
    if (!ok) {
      await this.d.repo.updateIncoming(order.id, { status: this.move(order, "needs_attention"), reason: "payment_verification_mismatch", updatedAt: this.d.now() });
      return;
    }
    await this.d.repo.updateIncoming(order.id, {
      status: this.move(order, "payment_captured"), paymentState: "captured",
      stripeChargeId: pi.chargeId, chargedMinor: pi.amountMinor, capturedAt: this.d.now(), updatedAt: this.d.now(),
    });
  }

  // ---- submit worker (global claim, per-order tenant re-entry) ------------
  async runSubmitOnce(owner: string): Promise<{ processed: number }> {
    const claimed = await this.d.repo.claimForSubmit(owner, this.d.now());
    for (const order of claimed) await runWithTenant({ organizationId: order.organizationId }, () => this.submitOne(order));
    return { processed: claimed.length };
  }

  private async submitOne(order: TransferOrder): Promise<void> {
    const epp = await this.d.repo.getEppForSubmission(order.id);
    if (!epp) {
      // EPP already consumed/destroyed — treat as ambiguous, reconcile.
      await this.d.repo.updateIncoming(order.id, { status: this.move(order, "transfer_unknown"), transferState: "unknown", reason: "epp_missing", leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
      return;
    }
    let submitted: { state: string; corr?: string } | null = null;
    try {
      const res = await this.d.registrar.initiateInboundTransfer(order.asciiDomain, epp, `transfer:${order.id}`);
      submitted = { state: res.state, corr: res.correlation?.orderId };
    } catch {
      submitted = null; // ambiguous — never blind-resubmit
    } finally {
      // The auth code is single-use; destroy it whether or not we got a reply.
      await this.d.repo.destroyEpp(order.id);
    }
    await this.recordAttempt(order, "transfer_submit", submitted ? mapOutcome(submitted.state) : "ambiguous_unknown", submitted?.corr);

    if (!submitted) {
      await this.d.repo.updateIncoming(order.id, { status: this.move(order, "transfer_unknown"), transferState: "unknown", reason: "submit_ambiguous", leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
      return;
    }
    if (submitted.state === "failed" || submitted.state === "rejected") {
      await this.failAndRefund(order, "transfer_rejected");
      return;
    }
    if (submitted.state === "completed") {
      await this.complete(order);
      return;
    }
    // pending: long poll; no guaranteed completion date.
    await this.d.repo.updateIncoming(order.id, {
      status: this.move(order, "transfer_pending"), transferState: "pending",
      providerCorrelationId: submitted.corr, submittedAt: this.d.now(),
      nextAttemptAt: new Date(Date.parse(this.d.now()) + (this.d.backoffMs ?? 300_000)).toISOString(),
      leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
    });
  }

  // ---- poll worker --------------------------------------------------------
  async runPollOnce(owner: string): Promise<{ processed: number }> {
    const claimed = await this.d.repo.claimPending(owner, this.d.now());
    for (const order of claimed) await runWithTenant({ organizationId: order.organizationId }, () => this.pollOne(order));
    return { processed: claimed.length };
  }

  private async pollOne(order: TransferOrder): Promise<void> {
    let state: string;
    try {
      state = (await this.d.registrar.getTransferStatus(order.asciiDomain)).state;
    } catch {
      // Transient: reschedule, never fabricate. Transfers legitimately take days.
      await this.d.repo.updateIncoming(order.id, { nextAttemptAt: this.backoff(order), leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
      return;
    }
    await this.recordAttempt(order, "transfer_poll", mapOutcome(state));
    if (state === "completed") return this.complete(order);
    if (state === "failed" || state === "rejected") return this.failAndRefund(order, "transfer_rejected");
    // still pending: reschedule (honest — no guaranteed date).
    await this.d.repo.updateIncoming(order.id, { nextAttemptAt: this.backoff(order), leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
  }

  private async complete(order: TransferOrder): Promise<void> {
    // Persist the VERIFIED provider expiry (never assume a bonus year). Create
    // the ownership record; DO NOT touch nameservers/DNS (preserved by default).
    let expiresAt: string | undefined;
    try { expiresAt = (await this.d.registrar.getExpiry(order.asciiDomain)).expiresAt; } catch { expiresAt = undefined; }
    const reg = await this.d.registrations.create({
      id: this.d.newId(), orderId: order.id, asciiDomain: order.asciiDomain,
      unicodeDomain: order.asciiDomain, tld: order.tld, provider: order.provider,
      registeredAt: this.d.now(), expiresAt,
    });
    await this.d.repo.updateIncoming(order.id, {
      status: this.move(order, "transfer_completed"), transferState: "completed",
      registrationId: reg.id, completedAt: this.d.now(), leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
    });
    await this.d.repo.destroyEpp(order.id); // belt-and-braces
  }

  private async failAndRefund(order: TransferOrder, reason: string): Promise<void> {
    await this.d.repo.updateIncoming(order.id, { status: this.move(order, "transfer_failed"), transferState: "failed", reason: safeReason(reason), leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
    await this.d.repo.destroyEpp(order.id);
    await this.enqueueRefund({ ...order, status: "transfer_failed" }, reason);
  }

  private async enqueueRefund(order: TransferOrder, reason: string): Promise<void> {
    if (!order.chargedMinor) return;
    await this.d.repo.createRefund({
      id: this.d.newId(), transferOrderId: order.id, stripeChargeId: order.stripeChargeId,
      amountMinor: order.chargedMinor, currency: order.currency, reason: safeReason(reason),
      state: "queued", idempotencyKey: `transfer-refund:${order.id}`, attempts: 0, createdAt: this.d.now(), updatedAt: this.d.now(),
    });
    await this.d.repo.updateIncoming(order.id, { status: this.move(order, "refund_queued"), refundState: "queued", updatedAt: this.d.now() });
  }

  // ---- refund worker ------------------------------------------------------
  async runRefundOnce(owner: string): Promise<{ processed: number }> {
    const claimed = await this.d.repo.claimRefunds(owner, this.d.now());
    for (const r of claimed) await runWithTenant({ organizationId: r.organizationId }, () => this.processRefund(r.id, r.state, r.stripeChargeId, r.stripeRefundId, r.amountMinor, r.reason, r.idempotencyKey, r.transferOrderId));
    return { processed: claimed.length };
  }

  private async processRefund(id: string, state: string, chargeId: string | undefined, refundId: string | undefined, amountMinor: number, reason: string, idempotencyKey: string, orderId: string): Promise<void> {
    if (state === "queued") {
      const view = await this.d.stripe.createRefund({ chargeId: chargeId ?? "", amountMinor, reason, idempotencyKey });
      await this.d.repo.updateRefund(id, { state: view.status === "failed" ? "failed" : "pending", stripeRefundId: view.id, updatedAt: this.d.now() });
      await this.syncOrderRefund(orderId, view.status === "failed" ? "refund_failed" : "refund_pending");
    } else if (state === "pending" && refundId) {
      const view = await this.d.stripe.getRefund(refundId);
      if (view.status === "succeeded") { await this.d.repo.updateRefund(id, { state: "refunded", updatedAt: this.d.now() }); await this.syncOrderRefund(orderId, "refunded"); }
      else if (view.status === "failed") { await this.d.repo.updateRefund(id, { state: "failed", updatedAt: this.d.now() }); await this.syncOrderRefund(orderId, "refund_failed"); }
    }
  }

  private async syncOrderRefund(orderId: string, to: TransferStatus): Promise<void> {
    const order = await this.d.repo.getIncoming(orderId);
    if (!order) return;
    const moved = this.move(order, to);
    const refundState = to === "refunded" ? "refunded" : to === "refund_failed" ? "failed" : "pending";
    await this.d.repo.updateIncoming(orderId, { status: moved, refundState, updatedAt: this.d.now() });
    if (to === "refund_failed") await this.d.repo.updateIncoming(orderId, { status: this.move({ ...order, status: moved }, "needs_attention"), updatedAt: this.d.now() });
  }

  // ---- reconciliation of transfer_unknown --------------------------------
  async runReconcileOnce(owner: string): Promise<{ processed: number }> {
    await this.d.repo.recoverExpiredSubmit(this.d.now());
    const claimed = await this.d.repo.claimUnknownForReconcile(owner, this.d.now());
    for (const order of claimed) await runWithTenant({ organizationId: order.organizationId }, () => this.reconcileClaimed(order));
    return { processed: claimed.length };
  }

  private async reconcileClaimed(order: TransferOrder): Promise<void> {
    let state: string;
    try { state = (await this.d.registrar.getTransferStatus(order.asciiDomain)).state; }
    catch {
      await this.recordAttempt(order, "transfer_reconcile", "ambiguous_unknown", "provider_unreachable");
      const attempts = order.attempts + 1;
      if (attempts >= (this.d.maxAttempts ?? 5)) {
        await this.d.repo.updateIncoming(order.id, { status: this.move(order, "needs_attention"), attempts, reason: "reconcile_unresolved", leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
        return;
      }
      await this.d.repo.updateIncoming(order.id, { attempts, nextAttemptAt: this.backoff({ ...order, attempts }), leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
      return;
    }
    await this.recordAttempt(order, "transfer_reconcile", mapOutcome(state));
    if (state === "completed") return this.complete(order);
    if (state === "failed" || state === "rejected") return this.failAndRefund(order, "reconciled_transfer_failed");
    // still pending at the registry: move back to pending polling (honest).
    await this.d.repo.updateIncoming(order.id, { status: this.move(order, "transfer_pending"), transferState: "pending", nextAttemptAt: this.backoff(order), leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now() });
  }

  // ==== OUTGOING (deliberate owner actions; not a saga) ===================
  /** Unlock the domain to permit transfer-away. Deliberate, owner-only + reauth. */
  async outgoingUnlock(registrationId: string, auth: AuthContext): Promise<void> {
    const reg = await this.requireOwnedRegistration(registrationId, auth);
    const res = await this.d.registrar.setRegistrarLock(reg.asciiDomain, false, `unlock:${registrationId}`);
    await this.d.repo.appendOutgoingAction({ id: this.d.newId(), registrationId, action: "unlock", outcome: res.outcome, actorUserId: authUserId(auth), createdAt: this.d.now() });
  }

  /** Re-lock (owner may cancel a transfer-away). */
  async outgoingRelock(registrationId: string, auth: AuthContext): Promise<void> {
    const reg = await this.requireOwnedRegistration(registrationId, auth);
    const res = await this.d.registrar.setRegistrarLock(reg.asciiDomain, true, `relock:${registrationId}`);
    await this.d.repo.appendOutgoingAction({ id: this.d.newId(), registrationId, action: "relock", outcome: res.outcome, actorUserId: authUserId(auth), createdAt: this.d.now() });
  }

  /**
   * Request the transfer-away auth code. SEPARATE deliberate confirmation.
   * If the provider only EMAILS it to the registrant (NameSilo), the platform
   * returns delivery info ONLY — it never stores/logs/returns a code it did not
   * receive. When a code IS returned, it is handed back to the owner transiently
   * and NEVER persisted.
   */
  async outgoingRequestAuthCode(registrationId: string, auth: AuthContext): Promise<{ delivery: string; code?: string }> {
    const reg = await this.requireOwnedRegistration(registrationId, auth);
    const res = await this.d.registrar.requestAuthCode(reg.asciiDomain);
    // Audit records ONLY the delivery channel + outcome — never the code itself.
    await this.d.repo.appendOutgoingAction({
      id: this.d.newId(), registrationId, action: "request_auth_code",
      outcome: "definitive_success", codeDelivery: res.delivery, actorUserId: authUserId(auth), createdAt: this.d.now(),
    });
    // Hand the code back transiently ONLY if the provider actually returned it.
    return res.delivery === "returned" && res.code ? { delivery: res.delivery, code: res.code } : { delivery: res.delivery };
  }

  private async requireOwnedRegistration(registrationId: string, auth: AuthContext) {
    // Ownership-sensitive: owner-only + recent reauth. We never obstruct a
    // transfer-away; this gate only proves the actor may act on the domain.
    const decision = authorizeDomainAction("purchase", auth);
    if (!decision.allowed) throw new TransferAuthError(decision.reason ?? "role");
    const reg = await this.d.registrations.get(registrationId);
    if (!reg) throw new TransferGateError("registration_not_found");
    return reg;
  }

  private backoff(order: TransferOrder): string {
    const attempts = Math.max(1, order.attempts);
    return new Date(Date.parse(this.d.now()) + (this.d.backoffMs ?? 300_000) * 2 ** (attempts - 1)).toISOString();
  }

  private async recordAttempt(order: TransferOrder, operation: string, outcome: string, corr?: string): Promise<void> {
    await this.d.repo.appendAttempt({ id: this.d.newId(), transferOrderId: order.id, operation, outcome, attemptNo: order.attempts + 1, providerCorrelationId: corr, createdAt: this.d.now() });
  }
}

/** Maps a provider TransferState to a five-way-style outcome enum for audit. */
function mapOutcome(state: string): string {
  if (state === "completed") return "definitive_success";
  if (state === "failed" || state === "rejected") return "definitive_failure";
  if (state === "pending" || state === "approved") return "pending";
  return "ambiguous_unknown";
}

function safeReason(s: string | undefined): string {
  return (s ?? "unknown").replace(/[^a-z0-9_]/gi, "_").slice(0, 40);
}
function authUserId(auth: AuthContext): string | undefined {
  return (auth as unknown as { userId?: string }).userId;
}
