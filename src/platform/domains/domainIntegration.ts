/**
 * Stage 11 production-integration seam for the domain-registration subsystem.
 *
 * Builds the live (TEST-MODE) domain runtime — Stripe gateway, the three sagas,
 * and the Stripe webhook handler — from environment + the Postgres pool, and
 * FAILS CLOSED at every missing prerequisite:
 *
 *  - no `sk_test_…` domain Stripe key                → no runtime (webhook off)
 *  - no domain webhook secret                        → no runtime (webhook off)
 *  - no domain contact-encryption keyring in env     → no runtime (webhook off)
 *
 * So on a default production environment (none of these set) the domain webhook
 * endpoint returns `DOMAIN_WEBHOOK_DISABLED` and nothing domain-related runs.
 * The registrar itself stays `Disconnected` unless separately configured, and
 * published-terms gates return `null` (unpublished) so no purchase/transfer can
 * clear its terms gate. This module only assembles wiring; it enables nothing.
 */

import { randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";
import { ProcessedEventsRepository } from "../billing/ProcessedEventsRepository";
import { BlindIndex } from "./crypto/BlindIndex";
import { EnvelopeCipher } from "./crypto/EnvelopeCipher";
import { Keyring } from "./crypto/Keyring";
import { DomainContactRepository } from "./DomainContactRepository";
import { DomainQuoteRepository } from "./DomainQuoteRepository";
import { DomainQuoteService } from "./DomainQuoteService";
import { DomainRegistrationRepository } from "./DomainRegistrationRepository";
import { DomainTermsAcceptanceRepository, DomainTermsService } from "./DomainTermsService";
import { createRegistrarProvider, type RegistrarEnv } from "./registrarFactory";
import { DEFAULT_PRICING_POLICY } from "./pricing/PricingPolicy";
import { DomainPurchaseSaga } from "./saga/DomainPurchaseSaga";
import { DomainSagaRepository } from "./saga/DomainSagaRepository";
import {
  DisconnectedDomainStripeGateway,
  HttpDomainStripeGateway,
  type DomainStripeGateway,
} from "./saga/DomainStripeGateway";
import { DomainWebhookHandler, type DomainWebhookChannel } from "./saga/DomainWebhookHandler";
import { DomainRenewalRepository } from "./renewal/DomainRenewalRepository";
import { DomainRenewalSaga } from "./renewal/DomainRenewalSaga";
import { DomainTransferRepository } from "./transfer/DomainTransferRepository";
import { DomainTransferSaga } from "./transfer/DomainTransferSaga";

const truthy = (v: string | undefined): boolean =>
  ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());

export interface DomainRuntime {
  webhookHandler: DomainWebhookHandler;
  purchase: DomainPurchaseSaga;
  renewal: DomainRenewalSaga;
  transfer: DomainTransferSaga;
}

export interface DomainIntegrationEnv extends RegistrarEnv {
  STRIPE_DOMAIN_SECRET_KEY?: string;
  STRIPE_DOMAIN_WEBHOOK_SECRET?: string;
  DOMAIN_CHECKOUT_SUCCESS_URL?: string;
  DOMAIN_CHECKOUT_CANCEL_URL?: string;
  [key: string]: string | undefined;
}

/**
 * Assembles the domain runtime, or returns `undefined` (fail closed) when any
 * prerequisite is missing. The Stripe key MUST be a `sk_test_…` key — a live key
 * is refused by `HttpDomainStripeGateway` (Stage-wide test-only guard).
 */
export function buildDomainRuntime(
  env: DomainIntegrationEnv,
  db: PgQueryable | undefined,
): DomainRuntime | undefined {
  const secretKey = env.STRIPE_DOMAIN_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_DOMAIN_WEBHOOK_SECRET?.trim();
  const keyring = Keyring.fromEnv(env);

  // Fail closed: without a test key + webhook secret + keyring there is no runtime.
  if (!secretKey || !/^sk_test_/.test(secretKey) || !webhookSecret || !keyring) {
    return undefined;
  }

  let gateway: DomainStripeGateway;
  try {
    gateway = new HttpDomainStripeGateway({ secretKey, webhookSecret });
  } catch {
    // Non-test key or misconfig → disconnected (endpoint stays off).
    gateway = new DisconnectedDomainStripeGateway();
    return undefined;
  }

  const cipher = new EnvelopeCipher(keyring);
  const blind = new BlindIndex(keyring);
  const registrar = createRegistrarProvider(env);
  const processedEvents = new ProcessedEventsRepository(db);
  const beginEvent = (eventId: string) => processedEvents.markProcessed(eventId, "domain");
  const now = () => new Date().toISOString();
  const newId = () => randomUUID();
  const successUrl = env.DOMAIN_CHECKOUT_SUCCESS_URL?.trim() || "https://app.allelitecloud.com/app/domains?checkout=success";
  const cancelUrl = env.DOMAIN_CHECKOUT_CANCEL_URL?.trim() || "https://app.allelitecloud.com/app/domains?checkout=cancel";

  const sagaRepo = new DomainSagaRepository(db);
  const renewalRepo = new DomainRenewalRepository(db);
  const transferRepo = new DomainTransferRepository(db, cipher);
  const registrations = new DomainRegistrationRepository(db);
  const contacts = new DomainContactRepository(cipher, blind, db);

  const quotes = new DomainQuoteService({
    provider: registrar,
    quotes: new DomainQuoteRepository(db),
    policy: DEFAULT_PRICING_POLICY,
    nowMs: () => Date.now(),
    ttlMs: 15 * 60_000,
    newId,
    customerCurrency: "USD",
  });
  const terms = new DomainTermsService({
    repo: new DomainTermsAcceptanceRepository(db),
    // Terms remain UNPUBLISHED until attorney review + explicit publish; null =
    // the purchase/transfer terms gate fails closed.
    publishedTermsVersion: () => null,
    newId,
    now,
    registrarAgreementRef: "namesilo-registration-agreement",
  });

  const purchase = new DomainPurchaseSaga({
    repo: sagaRepo, stripe: gateway, registrar, registrations, quotes, terms, contacts,
    now, newId, successUrl, cancelUrl, beginEvent,
  });
  const renewal = new DomainRenewalSaga({
    repo: renewalRepo, stripe: gateway, registrar, registrations, policy: DEFAULT_PRICING_POLICY,
    now, newId, successUrl, cancelUrl, beginEvent,
  });
  const transfer = new DomainTransferSaga({
    repo: transferRepo, stripe: gateway, registrar, registrations, policy: DEFAULT_PRICING_POLICY,
    now, newId, successUrl, cancelUrl,
    incomingTransfersEnabled: truthy(env.DOMAIN_INCOMING_TRANSFERS_ENABLED),
    publishedTransferTermsVersion: () => null, // unpublished → fail closed
    beginEvent,
  });

  const channels: DomainWebhookChannel[] = [
    { name: "purchase", owns: async (cid) => Boolean(await sagaRepo.getOrderByCheckoutId(cid)), handle: (a) => purchase.handleCheckoutCompleted(a) },
    { name: "renewal", owns: async (cid) => Boolean(await renewalRepo.getOrderByCheckoutId(cid)), handle: (a) => renewal.handleCheckoutCompleted(a) },
    { name: "transfer", owns: async (cid) => Boolean(await transferRepo.getIncomingByCheckoutId(cid)), handle: (a) => transfer.handleCheckoutCompleted(a) },
  ];

  return { webhookHandler: new DomainWebhookHandler(gateway, channels), purchase, renewal, transfer };
}
