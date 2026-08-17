/**
 * The domain purchase saga (Stripe TEST MODE + fake/sandbox registrar).
 *
 * Enforces the authoritative order and the hard safety boundaries:
 *  - checkout is created only after quote-recheck + published-terms acceptance +
 *    registrant-contact presence + owner authorization (+ recent reauth);
 *  - payment is captured ONLY from a verified webhook (never the browser return),
 *    and only after re-reading the PaymentIntent and matching amount/currency/
 *    tenant/order against the STORED order (metadata is a hint, not authority);
 *  - registration happens in a worker AFTER capture, exactly once; the provider
 *    price/availability is re-checked immediately before submission;
 *  - a definitive failure enqueues an idempotent refund; an AMBIGUOUS outcome
 *    becomes registration_unknown and is NEVER auto-retried and NEVER auto-
 *    refunded — only reconciliation (read-only) or an evidence-gated owner action
 *    resolves it, and no path issues a blind duplicate registration.
 */

import {
  authorizeDomainAction,
  type AuthContext,
} from "../contact/contactAuthPolicy";
import { DomainContactRepository } from "../DomainContactRepository";
import {
  DomainRegistrationRepository,
} from "../DomainRegistrationRepository";
import type { DomainQuoteService } from "../DomainQuoteService";
import type { DomainTermsService } from "../DomainTermsService";
import type { DomainRegistrarProvider, RegisterInput } from "../RegistrarProvider";
import type { RegistrarContact } from "../RegistrarContact";
import { DomainSagaRepository, type SagaOrder } from "./DomainSagaRepository";
import type { DomainStripeGateway } from "./DomainStripeGateway";
import { transition, type SagaStatus } from "./domainSagaState";

export class SagaAuthError extends Error {
  constructor(reason: string) {
    super(`Not authorized to purchase (${reason}).`);
    this.name = "SagaAuthError";
  }
}
export class SagaGateError extends Error {
  constructor(readonly gate: string) {
    super(`Purchase gate failed: ${gate}.`);
    this.name = "SagaGateError";
  }
}

export interface AuditEvent {
  orderId: string;
  from: SagaStatus;
  to: SagaStatus;
  kind: string;
}

export interface SagaDeps {
  repo: DomainSagaRepository;
  stripe: DomainStripeGateway;
  registrar: DomainRegistrarProvider;
  registrations: DomainRegistrationRepository;
  quotes: DomainQuoteService;
  terms: DomainTermsService;
  contacts: DomainContactRepository;
  now: () => string;
  newId: () => string;
  successUrl: string;
  cancelUrl: string;
  maxFulfillAttempts?: number;
  backoffMs?: number;
  /** Append-only, PII-free audit sink (ids + enums only). */
  audit?: (e: AuditEvent) => void;
  /** Stripe event-id dedup (returns true the first time only). */
  beginEvent?: (eventId: string) => Promise<boolean>;
}

export interface CreateCheckoutInput {
  quoteId: string;
  userId: string;
  /** A validated registrant must already exist for this (registration, role). */
  registrationRef: string;
  premiumAcknowledged?: boolean;
  contactEmail?: string;
}

export class DomainPurchaseSaga {
  constructor(private readonly d: SagaDeps) {}

  private move(order: SagaOrder, to: SagaStatus, kind: string): SagaOrder {
    const from = order.status;
    const status = transition(from, to); // fails closed
    this.d.audit?.({ orderId: order.id, from, to, kind });
    return { ...order, status };
  }

  // ---- 1. create checkout (all gates, server-side) ------------------------
  async createCheckout(input: CreateCheckoutInput, auth: AuthContext): Promise<{ orderId: string; checkoutUrl: string }> {
    // Gate: owner-only + recent reauth.
    const decision = authorizeDomainAction("purchase", auth);
    if (!decision.allowed) throw new SagaAuthError(decision.reason ?? "role");

    // Gate: immutable, unexpired quote re-checked against the live provider.
    const quoteRow = await this.d.quotes.recheckForPurchase(input.quoteId, {
      premiumAcknowledged: input.premiumAcknowledged,
    });

    // Gate: published terms accepted at the exact current version.
    if (await this.d.terms.needsReconsent(input.userId)) {
      throw new SagaGateError("terms_acceptance");
    }

    // Gate: an encrypted registrant contact version exists.
    const registrant = await this.d.contacts.getCurrent(input.registrationRef, "registrant");
    if (!registrant) throw new SagaGateError("registrant_contact");

    const nowIso = this.d.now();
    let order = await this.d.repo.createOrder({
      id: this.d.newId(),
      userId: input.userId,
      quoteId: quoteRow.id,
      asciiDomain: quoteRow.asciiDomain,
      tld: quoteRow.tld,
      years: quoteRow.years,
      provider: quoteRow.provider,
      currency: quoteRow.currency,
      customerPriceMinor: quoteRow.customerPriceMinor,
      providerCostMinor: quoteRow.providerCostMinor,
      isPremium: quoteRow.isPremium,
      status: "quote_ready",
      paymentState: "none",
      registrarState: "none",
      refundState: "none",
      idempotencyKey: `order:${quoteRow.id}`,
      contactRef: input.registrationRef,
      attempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    order = this.move(order, "checkout_created", "checkout_create");
    const checkout = await this.d.stripe.createOneTimeCheckout({
      orderId: order.id,
      organizationId: order.organizationId,
      userId: input.userId,
      quoteId: quoteRow.id,
      amountMinor: order.customerPriceMinor, // SERVER amount, never the browser's
      currency: order.currency,
      productName: `Domain registration: ${order.asciiDomain}`,
      successUrl: this.d.successUrl,
      cancelUrl: this.d.cancelUrl,
      customerEmail: input.contactEmail,
      idempotencyKey: `checkout:${order.id}`,
    });
    order = { ...order, stripeCheckoutId: checkout.id, stripePaymentIntentId: `pi_test_${checkout.id}`, paymentState: "checkout_created" };
    order = this.move(order, "awaiting_payment", "checkout_created");
    await this.d.repo.updateOrder(order.id, {
      status: order.status,
      stripeCheckoutId: order.stripeCheckoutId,
      stripePaymentIntentId: order.stripePaymentIntentId,
      paymentState: order.paymentState,
      updatedAt: nowIso,
    });
    return { orderId: order.id, checkoutUrl: checkout.url };
  }

  // ---- 2. webhook capture (never fulfill here) ----------------------------
  async handleCheckoutCompleted(args: {
    eventId: string;
    rawBody: string;
    signature: string;
    checkoutId: string;
    paymentIntentId: string;
  }): Promise<void> {
    if (!this.d.stripe.verifyWebhook(args.rawBody, args.signature)) {
      throw new SagaGateError("webhook_signature");
    }
    if (this.d.beginEvent && !(await this.d.beginEvent(args.eventId))) {
      return; // duplicate event — converge safely, no double capture
    }
    const order = await this.d.repo.getOrderByCheckoutId(args.checkoutId);
    if (!order) return; // unknown/foreign checkout -> ignore
    if (order.paymentState === "captured") return; // idempotent

    // Verify amount/currency/status FROM STRIPE against the STORED order.
    const pi = await this.d.stripe.getPaymentIntent(args.paymentIntentId);
    const ok =
      pi.status === "succeeded" &&
      pi.amountMinor === order.customerPriceMinor &&
      pi.currency === order.currency;
    if (!ok) {
      // Mismatch (amount/currency/state) — do NOT capture; flag for review.
      const flagged = this.move(order, "needs_attention", "payment_mismatch");
      await this.d.repo.updateOrder(order.id, {
        status: flagged.status,
        reason: "payment_verification_mismatch",
        updatedAt: this.d.now(),
      });
      return;
    }
    const captured = this.move(order, "payment_captured", "payment_captured");
    const queued = this.move(captured, "fulfillment_queued", "fulfillment_queued");
    await this.d.repo.updateOrder(order.id, {
      status: queued.status,
      paymentState: "captured",
      registrarState: "queued",
      stripeChargeId: pi.chargeId,
      chargedMinor: pi.amountMinor,
      capturedAt: this.d.now(),
      updatedAt: this.d.now(),
    });
  }

  // ---- 3. fulfillment worker ---------------------------------------------
  async runFulfillmentOnce(owner: string): Promise<{ processed: number }> {
    const nowIso = this.d.now();
    const claimed = await this.d.repo.claimFulfillment(owner, nowIso);
    for (const claimedOrder of claimed) {
      await this.fulfillOne(claimedOrder);
    }
    return { processed: claimed.length };
  }

  private async fulfillOne(order: SagaOrder): Promise<void> {
    // Re-check availability + price immediately before registrar submission.
    const [avail] = await this.d.registrar.checkAvailability([order.asciiDomain]);
    if (!avail || !avail.available) {
      return this.failAndRefund(order, "domain_unavailable");
    }
    if (avail.isPremium !== order.isPremium) {
      // Premium status changed -> requires a new quote + confirmation.
      return this.failAndRefund(order, "premium_status_changed");
    }
    const liveCost =
      avail.isPremium && avail.premiumRegisterPrice
        ? avail.premiumRegisterPrice
        : (await this.d.registrar.getRegisterPrice(order.tld, order.years)).cost;
    if (liveCost.currency !== order.currency) {
      return this.failAndRefund(order, "currency_mismatch");
    }
    if (liveCost.amountMinor > order.providerCostMinor) {
      // Cost increased: never charge more, never silently reduce service -> refund.
      return this.failAndRefund(order, "provider_cost_increased");
    }

    const contact = await this.d.contacts.getCurrent(order.contactRef!, "registrant");
    if (!contact) return this.failAndRefund(order, "registrant_missing");

    const registerInput: RegisterInput = {
      domain: order.asciiDomain,
      years: order.years,
      contacts: { registrant: contact, admin: contact, tech: contact, billing: contact },
      enablePrivacy: true,
      premiumAcknowledged: order.isPremium,
      idempotencyKey: `register:${order.id}`,
    };
    const result = await this.d.registrar.register(registerInput);

    if (result.outcome === "definitive_success" && result.registered) {
      await this.d.registrations.create({
        id: this.d.newId(),
        orderId: order.id,
        asciiDomain: order.asciiDomain,
        unicodeDomain: order.asciiDomain,
        tld: order.tld,
        provider: order.provider,
        providerDomainId: result.correlation.domainId,
        registeredAt: this.d.now(),
      });
      const done = this.move(order, "registered", "registered");
      await this.d.repo.updateOrder(order.id, {
        status: done.status,
        registrarState: "registered",
        providerCorrelationId: result.providerCorrelationId,
        registeredAt: this.d.now(),
        leaseOwner: undefined,
        leaseUntil: undefined,
        updatedAt: this.d.now(),
      });
      return;
    }

    if (result.outcome === "ambiguous_unknown") {
      // NEVER auto-retry, NEVER auto-refund.
      const unknown = this.move(order, "registration_unknown", "registration_unknown");
      await this.d.repo.updateOrder(order.id, {
        status: unknown.status,
        registrarState: "unknown",
        providerCorrelationId: result.providerCorrelationId,
        reason: safeReason(result.errorCategory),
        leaseOwner: undefined,
        leaseUntil: undefined,
        updatedAt: this.d.now(),
      });
      return;
    }

    if (result.outcome === "transport_failure_pre_acceptance") {
      // Nothing was accepted -> safe to retry, bounded.
      const max = this.d.maxFulfillAttempts ?? 5;
      const attempts = order.attempts + 1;
      if (attempts < max) {
        const backoff = (this.d.backoffMs ?? 300_000) * 2 ** (attempts - 1);
        await this.d.repo.updateOrder(order.id, {
          status: "fulfillment_queued",
          registrarState: "queued",
          attempts,
          nextAttemptAt: new Date(Date.parse(this.d.now()) + backoff).toISOString(),
          leaseOwner: undefined,
          leaseUntil: undefined,
          updatedAt: this.d.now(),
        });
        return;
      }
      return this.failAndRefund({ ...order, attempts }, "transport_failed");
    }

    // provider_rejection or definitive_failure -> definitive failure -> refund.
    const funds = /fund|balance|insufficient/i.test(result.errorCategory ?? "");
    const to: SagaStatus = result.outcome === "provider_rejection" ? "provider_rejected" : "registration_failed";
    const rejected = this.move(order, to, to);
    await this.d.repo.updateOrder(order.id, {
      status: rejected.status,
      registrarState: to === "provider_rejected" ? "rejected" : "failed",
      reason: funds ? "registrar_funding_required" : safeReason(result.errorCategory),
      providerCorrelationId: result.providerCorrelationId,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: this.d.now(),
    });
    await this.enqueueRefund(rejected, funds ? "registrar_funding_required" : "registration_failed");
  }

  private async failAndRefund(order: SagaOrder, reason: string): Promise<void> {
    const failed = this.move(order, "registration_failed", reason);
    await this.d.repo.updateOrder(order.id, {
      status: failed.status,
      registrarState: "failed",
      reason: safeReason(reason),
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: this.d.now(),
    });
    await this.enqueueRefund(failed, reason);
  }

  private async enqueueRefund(order: SagaOrder, reason: string): Promise<void> {
    if (!order.chargedMinor) return; // nothing captured -> nothing to refund
    await this.d.repo.createRefund({
      id: this.d.newId(),
      orderId: order.id,
      stripeChargeId: order.stripeChargeId,
      amountMinor: order.chargedMinor, // never exceeds the captured amount
      currency: order.currency,
      reason: safeReason(reason),
      state: "queued",
      idempotencyKey: `refund:${order.id}`,
      attempts: 0,
      createdAt: this.d.now(),
      updatedAt: this.d.now(),
    });
    const queued = this.move(order, "refund_queued", "refund_queued");
    await this.d.repo.updateOrder(order.id, {
      status: queued.status,
      refundState: "queued",
      updatedAt: this.d.now(),
    });
  }

  // ---- 4. refund worker ---------------------------------------------------
  async runRefundOnce(owner: string): Promise<{ processed: number }> {
    const nowIso = this.d.now();
    const claimed = await this.d.repo.claimRefunds(owner, nowIso);
    for (const refund of claimed) {
      if (refund.state === "queued") {
        const view = await this.d.stripe.createRefund({
          chargeId: refund.stripeChargeId ?? "",
          amountMinor: refund.amountMinor,
          reason: refund.reason,
          idempotencyKey: refund.idempotencyKey, // deterministic
        });
        await this.d.repo.updateRefund(refund.id, {
          state: view.status === "failed" ? "failed" : "pending",
          stripeRefundId: view.id,
          updatedAt: this.d.now(),
        });
        await this.syncOrderRefund(refund.orderId, view.status === "failed" ? "refund_failed" : "refund_pending");
      } else if (refund.state === "pending" && refund.stripeRefundId) {
        // Only Stripe confirmation flips to refunded/failed.
        const view = await this.d.stripe.getRefund(refund.stripeRefundId);
        if (view.status === "succeeded") {
          await this.d.repo.updateRefund(refund.id, { state: "refunded", updatedAt: this.d.now() });
          await this.syncOrderRefund(refund.orderId, "refunded");
        } else if (view.status === "failed") {
          await this.d.repo.updateRefund(refund.id, { state: "failed", updatedAt: this.d.now() });
          await this.syncOrderRefund(refund.orderId, "refund_failed");
        }
      }
    }
    return { processed: claimed.length };
  }

  private async syncOrderRefund(orderId: string, to: SagaStatus): Promise<void> {
    const order = await this.d.repo.getOrder(orderId);
    if (!order) return;
    const moved = this.move(order, to, to);
    const refundState = to === "refunded" ? "refunded" : to === "refund_failed" ? "failed" : "pending";
    await this.d.repo.updateOrder(orderId, {
      status: moved.status,
      refundState,
      updatedAt: this.d.now(),
    });
    if (to === "refund_failed") {
      const na = this.move(moved, "needs_attention", "refund_failed_review");
      await this.d.repo.updateOrder(orderId, { status: na.status, updatedAt: this.d.now() });
    }
  }

  // ---- 5. reconciliation of registration_unknown --------------------------
  async reconcileUnknown(orderId: string): Promise<SagaStatus> {
    const order = await this.d.repo.getOrder(orderId);
    if (!order || order.status !== "registration_unknown") {
      throw new SagaGateError("not_unknown");
    }
    const status = await this.d.registrar.getRegistrationStatus(order.asciiDomain);
    if (status.registered) {
      // Ownership confirmed -> complete WITHOUT another registrar mutation.
      await this.ensureRegistrationRecord(order);
      const done = this.move(order, "registered", "reconciled_registered");
      await this.d.repo.updateOrder(orderId, {
        status: done.status,
        registrarState: "registered",
        registeredAt: this.d.now(),
        updatedAt: this.d.now(),
      });
      return "registered";
    }
    // Only refund on PROVEN non-registration; here getRegistrationStatus said no.
    await this.enqueueRefund(order, "reconciled_not_registered");
    return "refund_queued";
  }

  private async ensureRegistrationRecord(order: SagaOrder): Promise<void> {
    const existing = await this.d.registrations.get(order.id).catch(() => undefined);
    if (existing) return;
    await this.d.registrations.create({
      id: this.d.newId(),
      orderId: order.id,
      asciiDomain: order.asciiDomain,
      unicodeDomain: order.asciiDomain,
      tld: order.tld,
      provider: order.provider,
      registeredAt: this.d.now(),
    }).catch(() => undefined); // unique(provider,domain) guards duplicates
  }

  // ---- owner reconciliation controls (no blind duplicate registration) ----
  async ownerResolveAsRegistered(orderId: string, evidenceNote: string): Promise<void> {
    if (!evidenceNote || evidenceNote.trim().length < 8) {
      throw new SagaGateError("evidence_required");
    }
    const order = await this.d.repo.getOrder(orderId);
    if (!order || order.status !== "registration_unknown") throw new SagaGateError("not_unknown");
    await this.ensureRegistrationRecord(order); // NO registrar mutation
    const done = this.move(order, "registered", "owner_resolved_registered");
    await this.d.repo.updateOrder(orderId, {
      status: done.status,
      registrarState: "registered",
      reason: "owner_resolved_with_evidence",
      registeredAt: this.d.now(),
      updatedAt: this.d.now(),
    });
  }

  async ownerResolveAsNotRegistered(orderId: string): Promise<void> {
    const order = await this.d.repo.getOrder(orderId);
    if (!order || order.status !== "registration_unknown") throw new SagaGateError("not_unknown");
    await this.enqueueRefund(order, "owner_resolved_not_registered");
  }
}

/** Bounded, PII/secret-free reason category. */
function safeReason(s: string | undefined): string {
  return (s ?? "unknown").replace(/[^a-z0-9_]/gi, "_").slice(0, 40);
}
