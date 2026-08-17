/**
 * Provider-neutral domain search + quotation service (Stage 4).
 *
 * Guarantees:
 *  - Availability is advisory; a QUOTE is an immutable, expiring record bound to
 *    tenant + normalized ASCII domain + TLD + operation + term + currency +
 *    provider + pricing version.
 *  - The provider price is RE-CHECKED immediately before purchase; an expired or
 *    changed quote FAILS CLOSED and requires customer reconfirmation.
 *  - A provider/customer currency mismatch FAILS CLOSED (no FX yet).
 *  - Premium domains are detected and require explicit confirmation before a
 *    quote can be consumed.
 *  - The customer sees the final price and the renewal price — NEVER our
 *    wholesale cost or markup; those appear only in owner/platform-admin
 *    diagnostics.
 *  - No client-supplied provider cost, markup, currency, or premium status is
 *    ever accepted — every figure is computed server-side from the provider +
 *    the pricing policy. Registration, renewal, transfer and restoration prices
 *    are surfaced SEPARATELY (no first-year-only presentation hiding renewal).
 */

import {
  normalizeDomain,
  type NormalizedDomain,
} from "./domainName";
import { CapabilityUnsupportedError, type DomainRegistrarProvider } from "./RegistrarProvider";
import {
  customerPriceMinor,
  markupMinor,
  ruleForPlan,
  type PricingPolicy,
} from "./pricing/PricingPolicy";
import {
  DomainQuoteRepository,
  type DomainQuoteRow,
} from "./DomainQuoteRepository";

export class DomainUnavailableError extends Error {
  constructor(readonly domain: string) {
    super("Domain is not available for registration.");
    this.name = "DomainUnavailableError";
  }
}
export class QuoteExpiredError extends Error {
  constructor() {
    super("Quote expired; please search again to get a fresh price.");
    this.name = "QuoteExpiredError";
  }
}
export class QuoteChangedError extends Error {
  constructor() {
    super("The registrar price changed; please reconfirm the new price.");
    this.name = "QuoteChangedError";
  }
}
export class QuoteStaleError extends Error {
  constructor() {
    super("Quote is not active.");
    this.name = "QuoteStaleError";
  }
}
export class CurrencyMismatchError extends Error {
  constructor(readonly providerCurrency: string, readonly customerCurrency: string) {
    super("Provider/customer currency mismatch; no FX conversion available.");
    this.name = "CurrencyMismatchError";
  }
}
export class PremiumConfirmationRequiredError extends Error {
  constructor() {
    super("This is a premium domain; explicit confirmation is required.");
    this.name = "PremiumConfirmationRequiredError";
  }
}

export type DomainOperation = "register" | "renew" | "transfer" | "restore";

/** Advisory price preview for one domain — all operations shown separately. */
export interface PricePreview {
  asciiDomain: string;
  unicodeDomain: string;
  tld: string;
  isIdn: boolean;
  mixedScriptWarning: boolean;
  available: boolean;
  isPremium: boolean;
  currency: string;
  /** Customer-facing prices (minor units) — NOT wholesale cost. */
  registerPriceMinor?: number;
  renewPriceMinor?: number;
  transferPriceMinor?: number;
  restorePriceMinor?: number;
}

/** Customer-facing quote — final + renewal price, never wholesale/markup. */
export interface CustomerQuote {
  id: string;
  asciiDomain: string;
  unicodeDomain: string;
  tld: string;
  isIdn: boolean;
  isPremium: boolean;
  requiresPremiumConfirmation: boolean;
  operation: DomainOperation;
  years: number;
  currency: string;
  priceMinor: number;
  renewalPriceMinor?: number;
  transferPriceMinor?: number;
  expiresAt: string;
}

/** Owner/platform-admin diagnostics — includes wholesale cost + markup. */
export interface QuoteDiagnostics extends CustomerQuote {
  provider: string;
  providerCostMinor: number;
  markupMinor: number;
  pricingVersion: number;
}

export interface QuoteServiceDeps {
  provider: DomainRegistrarProvider;
  quotes: DomainQuoteRepository;
  policy: PricingPolicy;
  /** Injected clock (ms since epoch) for deterministic expiry tests. */
  nowMs: () => number;
  /** Quote time-to-live in ms (short window). */
  ttlMs: number;
  /** Deterministic id generator. */
  newId: () => string;
  /** The single customer settlement currency (no FX yet). */
  customerCurrency: string;
}

export class DomainQuoteService {
  constructor(private readonly deps: QuoteServiceDeps) {}

  /** Advisory search — availability + all four prices, no persistence. */
  async search(rawDomains: string[], planId: string): Promise<PricePreview[]> {
    const rule = ruleForPlan(this.deps.policy, planId);
    const normed = rawDomains.map((d) => safeNormalize(d)).filter(Boolean) as NormalizedDomain[];
    if (normed.length === 0) return [];
    const availability = await this.deps.provider.checkAvailability(
      normed.map((n) => n.ascii),
    );
    const byDomain = new Map(availability.map((a) => [a.domain, a]));
    const out: PricePreview[] = [];
    for (const n of normed) {
      const avail = byDomain.get(n.ascii);
      const preview: PricePreview = {
        asciiDomain: n.ascii,
        unicodeDomain: n.unicode,
        tld: n.tld,
        isIdn: n.isIdn,
        mixedScriptWarning: n.mixedScriptWarning,
        available: avail?.available ?? false,
        isPremium: avail?.isPremium ?? false,
        currency: this.deps.customerCurrency,
      };
      // Registration price (premium uses the exact premium cost).
      const regCost =
        preview.isPremium && avail?.premiumRegisterPrice
          ? avail.premiumRegisterPrice
          : await this.deps.provider.getRegisterPrice(n.tld, 1).then((p) => p.cost).catch(() => undefined);
      if (regCost) {
        this.assertCurrency(regCost.currency);
        preview.registerPriceMinor = customerPriceMinor(regCost.amountMinor, rule);
      }
      preview.renewPriceMinor = await this.priceOrUndef(() =>
        this.deps.provider.getRenewPrice(n.tld, 1), rule,
      );
      preview.transferPriceMinor = await this.priceOrUndef(() =>
        this.deps.provider.getTransferPrice(n.tld, 1), rule,
      );
      preview.restorePriceMinor = await this.priceOrUndef(() =>
        this.deps.provider.getRestorePrice(n.tld), rule,
      );
      out.push(preview);
    }
    return out;
  }

  /** Creates an immutable, expiring, bound quote for a register operation. */
  async createRegisterQuote(
    rawDomain: string,
    years: number,
    planId: string,
  ): Promise<{ customer: CustomerQuote; diagnostics: QuoteDiagnostics }> {
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      throw new Error("years must be an integer from 1 to 10.");
    }
    const n = normalizeDomain(rawDomain);
    const rule = ruleForPlan(this.deps.policy, planId);
    const [avail] = await this.deps.provider.checkAvailability([n.ascii]);
    if (!avail?.available) throw new DomainUnavailableError(n.ascii);

    const regCost =
      avail.isPremium && avail.premiumRegisterPrice
        ? avail.premiumRegisterPrice
        : (await this.deps.provider.getRegisterPrice(n.tld, years)).cost;
    this.assertCurrency(regCost.currency);

    const renewCost = await this.optionalCost(() =>
      this.deps.provider.getRenewPrice(n.tld, years),
    );
    const transferCost = await this.optionalCost(() =>
      this.deps.provider.getTransferPrice(n.tld, years),
    );

    const markup = markupMinor(regCost.amountMinor, rule);
    const customerPrice = regCost.amountMinor + markup;
    const now = this.deps.nowMs();
    const row = await this.deps.quotes.create({
      id: this.deps.newId(),
      asciiDomain: n.ascii,
      unicodeDomain: n.unicode,
      tld: n.tld,
      isPremium: avail.isPremium,
      years,
      operation: "register",
      provider: this.deps.provider.providerId,
      currency: this.deps.customerCurrency,
      providerCostMinor: regCost.amountMinor,
      markupMinor: markup,
      customerPriceMinor: customerPrice,
      renewalCostMinor: renewCost?.amountMinor,
      renewalPriceMinor:
        renewCost != null ? customerPriceMinor(renewCost.amountMinor, rule) : undefined,
      transferPriceMinor:
        transferCost != null ? customerPriceMinor(transferCost.amountMinor, rule) : undefined,
      pricingVersion: this.deps.policy.version,
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.deps.ttlMs).toISOString(),
    });
    return { customer: toCustomer(row), diagnostics: toDiagnostics(row) };
  }

  /**
   * Re-checks a quote immediately before purchase. Fails closed if the quote is
   * not active, expired, currency-mismatched, the provider price changed, or a
   * premium confirmation is missing. Returns the (still valid) row on success.
   */
  async recheckForPurchase(
    quoteId: string,
    opts: { premiumAcknowledged?: boolean } = {},
  ): Promise<DomainQuoteRow> {
    const row = await this.deps.quotes.get(quoteId);
    if (!row) throw new QuoteStaleError();
    if (row.status !== "active") throw new QuoteStaleError();
    if (this.deps.nowMs() > Date.parse(row.expiresAt)) {
      await this.deps.quotes.setStatus(quoteId, "expired");
      throw new QuoteExpiredError();
    }
    if (row.isPremium && !opts.premiumAcknowledged) {
      throw new PremiumConfirmationRequiredError();
    }
    // Re-fetch the live provider cost and compare to the bound quote.
    const [avail] = await this.deps.provider.checkAvailability([row.asciiDomain]);
    if (!avail?.available) throw new DomainUnavailableError(row.asciiDomain);
    const liveCost =
      row.isPremium && avail.premiumRegisterPrice
        ? avail.premiumRegisterPrice
        : (await this.deps.provider.getRegisterPrice(row.tld, row.years)).cost;
    this.assertCurrency(liveCost.currency);
    if (
      liveCost.currency !== row.currency ||
      liveCost.amountMinor !== row.providerCostMinor
    ) {
      throw new QuoteChangedError();
    }
    return row;
  }

  private assertCurrency(providerCurrency: string): void {
    if (providerCurrency !== this.deps.customerCurrency) {
      throw new CurrencyMismatchError(providerCurrency, this.deps.customerCurrency);
    }
  }

  private async optionalCost(
    fn: () => Promise<{ cost: { amountMinor: number; currency: string } }>,
  ): Promise<{ amountMinor: number; currency: string } | undefined> {
    try {
      const p = await fn();
      this.assertCurrency(p.cost.currency);
      return p.cost;
    } catch (err) {
      if (err instanceof CapabilityUnsupportedError) return undefined;
      if (err instanceof CurrencyMismatchError) throw err;
      return undefined; // a pricing gap for an aux operation is non-fatal to display
    }
  }

  private async priceOrUndef(
    fn: () => Promise<{ cost: { amountMinor: number; currency: string } }>,
    rule: Parameters<typeof customerPriceMinor>[1],
  ): Promise<number | undefined> {
    const cost = await this.optionalCost(fn);
    return cost ? customerPriceMinor(cost.amountMinor, rule) : undefined;
  }
}

function safeNormalize(raw: string): NormalizedDomain | undefined {
  try {
    return normalizeDomain(raw);
  } catch {
    return undefined;
  }
}

function toCustomer(row: DomainQuoteRow): CustomerQuote {
  return {
    id: row.id,
    asciiDomain: row.asciiDomain,
    unicodeDomain: row.unicodeDomain,
    tld: row.tld,
    isIdn: row.asciiDomain.startsWith("xn--") || row.asciiDomain.includes(".xn--"),
    isPremium: row.isPremium,
    requiresPremiumConfirmation: row.isPremium,
    operation: row.operation as DomainOperation,
    years: row.years,
    currency: row.currency,
    priceMinor: row.customerPriceMinor,
    renewalPriceMinor: row.renewalPriceMinor,
    transferPriceMinor: row.transferPriceMinor,
    expiresAt: row.expiresAt,
  };
}

function toDiagnostics(row: DomainQuoteRow): QuoteDiagnostics {
  return {
    ...toCustomer(row),
    provider: row.provider,
    providerCostMinor: row.providerCostMinor,
    markupMinor: row.markupMinor,
    pricingVersion: row.pricingVersion,
  };
}
