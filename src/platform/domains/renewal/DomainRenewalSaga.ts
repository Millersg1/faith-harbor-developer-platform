/**
 * The domain RENEWAL saga (Stripe TEST MODE + fake/sandbox registrar).
 *
 * Renewal is a SEPARATE lifecycle from purchase and from workspace billing.
 * Safety boundaries enforced here:
 *  - manual vs automatic renewal are separate entry points; AUTO is opt-in and
 *    OFF by default, and only ever charges the CUSTOMER (off-session against a
 *    durably-authorized saved method) — All Elite funds never renew a domain;
 *  - a fresh authoritative renewal quote is taken before any checkout / charge;
 *  - the renewal order binds domain, tenant, registration, term, provider,
 *    currency, provider price, customer price, pricing version, the CURRENT
 *    expiration cycle, and the applicable terms;
 *  - a DB constraint prevents a duplicate renewal for the same (registration,
 *    expiration cycle, term);
 *  - the provider renewal happens ONLY after confirmed Stripe capture, exactly
 *    once (idempotent); a definitive failure refunds idempotently; an AMBIGUOUS
 *    outcome becomes `renewal_unknown` and is NEVER auto-retried or auto-refunded
 *    until read-only reconciliation establishes whether the renewal occurred;
 *  - a success refreshes + persists the provider-confirmed expiration date;
 *  - turning OFF auto-renew only flips the flag — it never cancels, deletes,
 *    surrenders, unlocks, or transfers a domain.
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
import type { DomainRegistrarProvider, RegisterResult } from "../RegistrarProvider";
import type { DomainStripeGateway } from "../saga/DomainStripeGateway";
import { DomainRenewalRepository, type RenewalOrder } from "./DomainRenewalRepository";
import { renewalTransition, type RenewalStatus } from "./renewalSagaState";

export class RenewalAuthError extends Error {
  constructor(reason: string) {
    super(`Not authorized to manage renewal (${reason}).`);
    this.name = "RenewalAuthError";
  }
}
export class RenewalGateError extends Error {
  constructor(readonly gate: string) {
    super(`Renewal gate failed: ${gate}.`);
    this.name = "RenewalGateError";
  }
}
export class AutoRenewNotAuthorized extends Error {
  constructor(reason: string) {
    super(`Automatic renewal is not authorized (${reason}); use a customer checkout instead.`);
    this.name = "AutoRenewNotAuthorized";
  }
}

export interface RenewalDeps {
  repo: DomainRenewalRepository;
  stripe: DomainStripeGateway;
  registrar: DomainRegistrarProvider;
  registrations: DomainRegistrationRepository;
  policy: PricingPolicy;
  now: () => string;
  newId: () => string;
  successUrl: string;
  cancelUrl: string;
  maxRenewAttempts?: number;
  backoffMs?: number;
  beginEvent?: (eventId: string) => Promise<boolean>;
}

export interface ManualRenewalInput {
  registrationId: string;
  userId: string;
  planId: string;
  termYears: number;
  termsAcceptanceId?: string;
}

export class DomainRenewalSaga {
  constructor(private readonly d: RenewalDeps) {}

  private move(order: RenewalOrder, to: RenewalStatus): RenewalStatus {
    return renewalTransition(order.status, to); // fails closed
  }

  private async requireConfirmed(registrationId: string) {
    const reg = await this.d.registrations.get(registrationId);
    if (!reg) throw new RenewalGateError("registration_not_found");
    if (reg.status !== "active") throw new RenewalGateError("registration_not_active");
    return reg;
  }

  /** Fresh authoritative renewal quote (renewal price, never a promo reg price). */
  private async freshQuote(tld: string, termYears: number, planId: string) {
    const price = await this.d.registrar.getRenewPrice(tld, termYears);
    const providerCostMinor = price.cost.amountMinor;
    const rule = ruleForPlan(this.d.policy, planId);
    return {
      providerCostMinor,
      customerPriceMinor: computeCustomerPrice(providerCostMinor, rule),
      currency: price.cost.currency,
      pricingVersion: this.d.policy.version,
    };
  }

  private async currentExpiry(reg: { expiresAt?: string; asciiDomain: string }): Promise<string> {
    if (reg.expiresAt) return reg.expiresAt;
    // Fall back to the provider's authoritative expiry (read-only).
    const status = await this.d.registrar.getExpiry(reg.asciiDomain);
    if (!status.expiresAt) throw new RenewalGateError("expiration_unknown");
    return status.expiresAt;
  }

  // ---- 1a. MANUAL renewal (customer checkout) -----------------------------
  async createManualRenewal(input: ManualRenewalInput): Promise<{ orderId: string; checkoutUrl: string }> {
    const reg = await this.requireConfirmed(input.registrationId);
    const quote = await this.freshQuote(reg.tld, input.termYears, input.planId);
    const currentExpiresAt = await this.currentExpiry(reg);
    const nowIso = this.d.now();

    let order = await this.d.repo.createOrder({
      id: this.d.newId(),
      registrationId: reg.id,
      userId: input.userId,
      asciiDomain: reg.asciiDomain,
      tld: reg.tld,
      termYears: input.termYears,
      provider: reg.provider,
      currency: quote.currency,
      providerCostMinor: quote.providerCostMinor,
      customerPriceMinor: quote.customerPriceMinor,
      pricingVersion: quote.pricingVersion,
      currentExpiresAt,
      mode: "manual",
      chargePath: "checkout",
      termsAcceptanceId: input.termsAcceptanceId,
      status: "quote_ready",
      paymentState: "none",
      renewalState: "none",
      refundState: "none",
      idempotencyKey: `renew:${reg.id}:${currentExpiresAt}:${input.termYears}`,
      attempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    order = { ...order, status: this.move(order, "checkout_created") };
    const checkout = await this.d.stripe.createOneTimeCheckout({
      orderId: order.id,
      organizationId: order.organizationId,
      userId: input.userId,
      quoteId: order.id, // the renewal order is its own quote reference
      amountMinor: order.customerPriceMinor,
      currency: order.currency,
      productName: `Domain renewal: ${order.asciiDomain} (${input.termYears}y)`,
      successUrl: this.d.successUrl,
      cancelUrl: this.d.cancelUrl,
      idempotencyKey: `renew-checkout:${order.id}`,
    });
    const awaiting = this.move({ ...order, status: "checkout_created" }, "awaiting_payment");
    await this.d.repo.updateOrder(order.id, {
      status: awaiting,
      stripeCheckoutId: checkout.id,
      stripePaymentIntentId: `pi_test_${checkout.id}`,
      paymentState: "checkout_created",
      updatedAt: nowIso,
    });
    return { orderId: order.id, checkoutUrl: checkout.url };
  }

  // ---- 1b. AUTO renew authorization (opt-in, owner-gated) ------------------
  async enableAutoRenew(
    registrationId: string,
    input: {
      userId: string;
      termsAcceptanceId: string;
      pricingVersionAck: number;
      stripeCustomerRef: string;
      stripePaymentMethodRef: string;
      currency: string;
    },
    auth: AuthContext,
  ): Promise<void> {
    // Enabling recurring off-session billing is an ownership-sensitive action.
    const decision = authorizeDomainAction("purchase", auth);
    if (!decision.allowed) throw new RenewalAuthError(decision.reason ?? "role");
    await this.requireConfirmed(registrationId);
    if (!input.stripePaymentMethodRef || !input.stripeCustomerRef) {
      throw new AutoRenewNotAuthorized("no_eligible_saved_payment_method");
    }
    const now = this.d.now();
    await this.d.repo.putAutoRenew({
      registrationId,
      enabled: true,
      authorizedByUserId: input.userId,
      authorizedAt: now,
      termsAcceptanceId: input.termsAcceptanceId,
      pricingVersionAck: input.pricingVersionAck,
      stripeCustomerRef: input.stripeCustomerRef,
      stripePaymentMethodRef: input.stripePaymentMethodRef,
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Turns OFF auto-renew. This ONLY flips the authorization flag — it never
   * cancels, deletes, surrenders, unlocks, or transfers the domain, and the
   * registration/ownership record is untouched.
   */
  async disableAutoRenew(registrationId: string, actorUserId: string): Promise<void> {
    const existing = await this.d.repo.getAutoRenew(registrationId);
    const now = this.d.now();
    await this.d.repo.putAutoRenew({
      registrationId,
      enabled: false,
      authorizedByUserId: actorUserId,
      authorizedAt: existing?.authorizedAt,
      termsAcceptanceId: existing?.termsAcceptanceId,
      pricingVersionAck: existing?.pricingVersionAck,
      // Drop the stored payment method — no future off-session charge is allowed.
      stripeCustomerRef: undefined,
      stripePaymentMethodRef: undefined,
      currency: existing?.currency,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  // ---- 1c. AUTO renewal run (off-session, customer-funded) ----------------
  async createAutoRenewal(registrationId: string): Promise<{ orderId: string; status: RenewalStatus }> {
    const reg = await this.requireConfirmed(registrationId);
    const auth = await this.d.repo.getAutoRenew(registrationId);
    if (!auth || !auth.enabled) throw new AutoRenewNotAuthorized("not_enabled");
    if (!auth.stripePaymentMethodRef || !auth.stripeCustomerRef) {
      throw new AutoRenewNotAuthorized("no_eligible_saved_payment_method");
    }
    const quote = await this.freshQuote(reg.tld, 1, planFromAuth(auth));
    const currentExpiresAt = await this.currentExpiry(reg);
    const nowIso = this.d.now();

    let order = await this.d.repo.createOrder({
      id: this.d.newId(),
      registrationId: reg.id,
      userId: auth.authorizedByUserId,
      asciiDomain: reg.asciiDomain,
      tld: reg.tld,
      termYears: 1,
      provider: reg.provider,
      currency: quote.currency,
      providerCostMinor: quote.providerCostMinor,
      customerPriceMinor: quote.customerPriceMinor,
      pricingVersion: quote.pricingVersion,
      currentExpiresAt,
      mode: "auto",
      chargePath: "off_session",
      termsAcceptanceId: auth.termsAcceptanceId,
      status: "quote_ready",
      paymentState: "none",
      renewalState: "none",
      refundState: "none",
      idempotencyKey: `renew:${reg.id}:${currentExpiresAt}:1`,
      attempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    order = { ...order, status: this.move(order, "off_session_authorized") };
    await this.d.repo.updateOrder(order.id, { status: "off_session_authorized", updatedAt: nowIso });

    // Off-session charge against the customer's authorized saved method.
    const pi = await this.d.stripe.chargeOffSession({
      orderId: order.id,
      organizationId: order.organizationId,
      amountMinor: order.customerPriceMinor,
      currency: order.currency,
      paymentMethodRef: auth.stripePaymentMethodRef,
      customerRef: auth.stripeCustomerRef,
      productName: `Domain auto-renewal: ${order.asciiDomain}`,
      idempotencyKey: `renew-offsession:${order.id}`,
    });

    if (pi.status === "succeeded") {
      const captured = this.move({ ...order, status: "off_session_authorized" }, "payment_captured");
      const queued = this.move({ ...order, status: captured }, "renewal_queued");
      await this.d.repo.updateOrder(order.id, {
        status: queued,
        paymentState: "captured",
        renewalState: "queued",
        stripePaymentIntentId: pi.id,
        stripeChargeId: pi.chargeId,
        chargedMinor: pi.amountMinor,
        capturedAt: nowIso,
        updatedAt: nowIso,
      });
      return { orderId: order.id, status: "renewal_queued" };
    }
    // requires_action / failed: the customer must complete payment (checkout).
    // NEVER capture, NEVER renew — All Elite funds do not renew the domain.
    const flagged = this.move({ ...order, status: "off_session_authorized" }, "needs_attention");
    await this.d.repo.updateOrder(order.id, {
      status: flagged,
      paymentState: "failed",
      reason: "off_session_declined",
      updatedAt: nowIso,
    });
    return { orderId: order.id, status: "needs_attention" };
  }

  // ---- 2. webhook capture (checkout path; never renew here) ----------------
  async handleCheckoutCompleted(args: {
    eventId: string; rawBody: string; signature: string; checkoutId: string; paymentIntentId: string;
  }): Promise<void> {
    if (!this.d.stripe.verifyWebhook(args.rawBody, args.signature)) throw new RenewalGateError("webhook_signature");
    if (this.d.beginEvent && !(await this.d.beginEvent(args.eventId))) return;
    const order = await this.d.repo.getOrderByCheckoutId(args.checkoutId);
    if (!order) return;
    if (order.paymentState === "captured") return;
    const pi = await this.d.stripe.getPaymentIntent(args.paymentIntentId);
    const ok = pi.status === "succeeded" && pi.amountMinor === order.customerPriceMinor && pi.currency === order.currency;
    if (!ok) {
      const flagged = this.move(order, "needs_attention");
      await this.d.repo.updateOrder(order.id, { status: flagged, reason: "payment_verification_mismatch", updatedAt: this.d.now() });
      return;
    }
    const captured = this.move(order, "payment_captured");
    const queued = this.move({ ...order, status: captured }, "renewal_queued");
    await this.d.repo.updateOrder(order.id, {
      status: queued, paymentState: "captured", renewalState: "queued",
      stripeChargeId: pi.chargeId, chargedMinor: pi.amountMinor, capturedAt: this.d.now(), updatedAt: this.d.now(),
    });
  }

  // ---- 3. renewal worker (global claim, per-order tenant re-entry) ---------
  async runRenewalOnce(owner: string): Promise<{ processed: number }> {
    const claimed = await this.d.repo.claimRenewal(owner, this.d.now());
    for (const order of claimed) {
      await runWithTenant({ organizationId: order.organizationId }, () => this.renewOne(order));
    }
    return { processed: claimed.length };
  }

  private async renewOne(order: RenewalOrder): Promise<void> {
    const result: RegisterResult = await this.d.registrar
      .renew(order.asciiDomain, order.termYears, `renew:${order.id}`)
      .catch(
        (): RegisterResult => ({
          outcome: "transport_failure_pre_acceptance",
          registered: false,
          correlation: {},
        }),
      );
    await this.recordAttempt(order, "renew", result.outcome, result.errorCategory, result.providerCorrelationId);

    if (result.outcome === "definitive_success" && result.registered) {
      // Refresh + persist the PROVIDER-CONFIRMED expiration date.
      const now = this.d.now();
      let newExpiresAt: string | undefined;
      try {
        const status = await this.d.registrar.getExpiry(order.asciiDomain);
        newExpiresAt = status.expiresAt;
      } catch {
        newExpiresAt = undefined; // success stands; expiry refresh will reconcile later
      }
      if (newExpiresAt) await this.d.registrations.setExpiry(order.registrationId, newExpiresAt, now);
      const done = this.move(order, "renewed");
      await this.d.repo.updateOrder(order.id, {
        status: done, renewalState: "renewed", newExpiresAt,
        providerCorrelationId: result.providerCorrelationId, renewedAt: now,
        leaseOwner: undefined, leaseUntil: undefined, updatedAt: now,
      });
      return;
    }

    if (result.outcome === "ambiguous_unknown") {
      const unknown = this.move(order, "renewal_unknown");
      await this.d.repo.updateOrder(order.id, {
        status: unknown, renewalState: "unknown", reason: safeReason(result.errorCategory),
        providerCorrelationId: result.providerCorrelationId, leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
      });
      return;
    }

    if (result.outcome === "transport_failure_pre_acceptance") {
      const max = this.d.maxRenewAttempts ?? 5;
      const attempts = order.attempts + 1;
      if (attempts < max) {
        const backoff = (this.d.backoffMs ?? 300_000) * 2 ** (attempts - 1);
        await this.d.repo.updateOrder(order.id, {
          status: this.move(order, "renewal_queued"), renewalState: "queued", attempts,
          nextAttemptAt: new Date(Date.parse(this.d.now()) + backoff).toISOString(),
          leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
        });
        return;
      }
      return this.failAndRefund({ ...order, attempts }, "renew_transport_failed");
    }

    // provider_rejection or definitive_failure -> refund.
    const to: RenewalStatus = result.outcome === "provider_rejection" ? "provider_rejected" : "renewal_failed";
    const moved = this.move(order, to);
    await this.d.repo.updateOrder(order.id, {
      status: moved, renewalState: to === "provider_rejected" ? "rejected" : "failed",
      reason: safeReason(result.errorCategory), providerCorrelationId: result.providerCorrelationId,
      leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
    });
    await this.enqueueRefund({ ...order, status: moved }, "renewal_failed");
  }

  private async failAndRefund(order: RenewalOrder, reason: string): Promise<void> {
    const failed = this.move(order, "renewal_failed");
    await this.d.repo.updateOrder(order.id, {
      status: failed, renewalState: "failed", reason: safeReason(reason),
      leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
    });
    await this.enqueueRefund({ ...order, status: failed }, reason);
  }

  private async enqueueRefund(order: RenewalOrder, reason: string): Promise<void> {
    if (!order.chargedMinor) return; // nothing captured -> nothing to refund
    await this.d.repo.createRefund({
      id: this.d.newId(), renewalOrderId: order.id, stripeChargeId: order.stripeChargeId,
      amountMinor: order.chargedMinor, currency: order.currency, reason: safeReason(reason),
      state: "queued", idempotencyKey: `renew-refund:${order.id}`, attempts: 0,
      createdAt: this.d.now(), updatedAt: this.d.now(),
    });
    const queued = this.move(order, "refund_queued");
    await this.d.repo.updateOrder(order.id, { status: queued, refundState: "queued", updatedAt: this.d.now() });
  }

  // ---- 4. refund worker ---------------------------------------------------
  async runRenewalRefundOnce(owner: string): Promise<{ processed: number }> {
    const claimed = await this.d.repo.claimRefunds(owner, this.d.now());
    for (const refund of claimed) {
      await runWithTenant({ organizationId: refund.organizationId }, () => this.processRefund(refund.id, refund.state, refund.stripeChargeId, refund.stripeRefundId, refund.amountMinor, refund.reason, refund.idempotencyKey, refund.renewalOrderId));
    }
    return { processed: claimed.length };
  }

  private async processRefund(
    id: string, state: string, chargeId: string | undefined, refundId: string | undefined,
    amountMinor: number, reason: string, idempotencyKey: string, orderId: string,
  ): Promise<void> {
    if (state === "queued") {
      const view = await this.d.stripe.createRefund({ chargeId: chargeId ?? "", amountMinor, reason, idempotencyKey });
      await this.d.repo.updateRefund(id, { state: view.status === "failed" ? "failed" : "pending", stripeRefundId: view.id, updatedAt: this.d.now() });
      await this.syncOrderRefund(orderId, view.status === "failed" ? "refund_failed" : "refund_pending");
    } else if (state === "pending" && refundId) {
      const view = await this.d.stripe.getRefund(refundId);
      if (view.status === "succeeded") {
        await this.d.repo.updateRefund(id, { state: "refunded", updatedAt: this.d.now() });
        await this.syncOrderRefund(orderId, "refunded");
      } else if (view.status === "failed") {
        await this.d.repo.updateRefund(id, { state: "failed", updatedAt: this.d.now() });
        await this.syncOrderRefund(orderId, "refund_failed");
      }
    }
  }

  private async syncOrderRefund(orderId: string, to: RenewalStatus): Promise<void> {
    const order = await this.d.repo.getOrder(orderId);
    if (!order) return;
    const moved = this.move(order, to);
    const refundState = to === "refunded" ? "refunded" : to === "refund_failed" ? "failed" : "pending";
    await this.d.repo.updateOrder(orderId, { status: moved, refundState, updatedAt: this.d.now() });
    if (to === "refund_failed") {
      const na = this.move({ ...order, status: moved }, "needs_attention");
      await this.d.repo.updateOrder(orderId, { status: na, updatedAt: this.d.now() });
    }
  }

  // ---- 5. reconciliation of renewal_unknown (read-only) -------------------
  async runRenewalReconcileOnce(owner: string): Promise<{ processed: number }> {
    await this.d.repo.recoverExpiredRenewal(this.d.now());
    const claimed = await this.d.repo.claimUnknownForReconcile(owner, this.d.now());
    for (const order of claimed) {
      await runWithTenant({ organizationId: order.organizationId }, () => this.reconcileClaimed(order));
    }
    return { processed: claimed.length };
  }

  private async reconcileClaimed(order: RenewalOrder): Promise<void> {
    let expiresAt: string | undefined;
    try {
      const status = await this.d.registrar.getExpiry(order.asciiDomain);
      expiresAt = status.expiresAt;
    } catch {
      await this.recordAttempt(order, "reconcile", "ambiguous_unknown", "provider_unreachable");
      const attempts = order.attempts + 1;
      const max = this.d.maxRenewAttempts ?? 5;
      if (attempts >= max) {
        await this.d.repo.updateOrder(order.id, {
          status: this.move(order, "needs_attention"), attempts, reason: "reconcile_unresolved",
          leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
        });
        return;
      }
      const backoff = (this.d.backoffMs ?? 300_000) * 2 ** (attempts - 1);
      await this.d.repo.updateOrder(order.id, {
        attempts, nextAttemptAt: new Date(Date.parse(this.d.now()) + backoff).toISOString(),
        leaseOwner: undefined, leaseUntil: undefined, updatedAt: this.d.now(),
      });
      return;
    }
    // The renewal occurred iff the provider expiry advanced beyond the cycle we billed.
    const renewed = !!expiresAt && Date.parse(expiresAt) > Date.parse(order.currentExpiresAt);
    await this.recordAttempt(order, "reconcile", renewed ? "definitive_success" : "definitive_failure");
    if (renewed) {
      const now = this.d.now();
      await this.d.registrations.setExpiry(order.registrationId, expiresAt!, now);
      await this.d.repo.updateOrder(order.id, {
        status: this.move(order, "renewed"), renewalState: "renewed", newExpiresAt: expiresAt,
        renewedAt: now, leaseOwner: undefined, leaseUntil: undefined, updatedAt: now,
      });
      return;
    }
    await this.enqueueRefund(order, "reconciled_not_renewed");
  }

  private async recordAttempt(order: RenewalOrder, operation: string, outcome: string, category?: string, corr?: string): Promise<void> {
    await this.d.repo.appendAttempt({
      id: this.d.newId(), renewalOrderId: order.id, operation, outcome,
      attemptNo: order.attempts + 1, errorCategory: category ? safeReason(category) : undefined,
      providerCorrelationId: corr, createdAt: this.d.now(),
    });
  }
}

function safeReason(s: string | undefined): string {
  return (s ?? "unknown").replace(/[^a-z0-9_]/gi, "_").slice(0, 40);
}

/** The plan an auto-renew authorization was created under is not stored on the
 *  authorization row; renewals price at the org's current plan when scheduled.
 *  Until Stage 11 wires the org plan through, auto uses the default plan tier. */
function planFromAuth(_auth: { pricingVersionAck?: number }): string {
  return "business";
}
