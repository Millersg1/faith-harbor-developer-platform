/**
 * A deterministic in-memory registrar for offline tests. It never touches the
 * network and lets a test script every outcome — including the dangerous ones
 * (ambiguous/unknown, registered=false, provider rejection) — so the saga and
 * reconciliation logic (later stages) can be proven without a real registrar.
 */

import type { RegistrarContact } from "./RegistrarContact";
import {
  type AvailabilityResult,
  type CapabilityMatrix,
  type DomainRegistrarProvider,
  type DomainStatus,
  type Money,
  type PriceResult,
  type RegisterInput,
  type RegisterResult,
  type RegistrarMode,
  type TransferStatusResult,
} from "./RegistrarProvider";

export interface FakeConfig {
  mode?: RegistrarMode;
  /** ascii-domain -> availability override. */
  availability?: Record<string, Partial<AvailabilityResult>>;
  /** tld -> cost minor units for register/renew/transfer. */
  priceByTld?: Record<string, number>;
  /** ascii-domain -> forced register result (to script outcomes). */
  registerResult?: Record<string, RegisterResult>;
  /** ascii-domain -> status for reconciliation lookups. */
  status?: Record<string, DomainStatus>;
  balanceMinor?: number;
  capabilities?: Partial<CapabilityMatrix>;
}

const cap = (
  status: "supported" | "unsupported" | "limited" | "unknown",
): { status: typeof status; evidence: "sandbox" } => ({
  status,
  evidence: "sandbox",
});

const DEFAULT_CAPS = (): CapabilityMatrix => ({
  availability: cap("supported"),
  pricing: cap("supported"),
  premiumDetection: cap("supported"),
  registration: cap("supported"),
  nonRealtimeRegistration: cap("supported"),
  renewal: cap("supported"),
  restoration: cap("supported"),
  incomingTransfer: cap("supported"),
  transferStatus: cap("supported"),
  contactManagement: cap("supported"),
  registrantChange: cap("supported"),
  nameservers: cap("supported"),
  dnsRecords: cap("supported"),
  lockUnlock: cap("supported"),
  eppAuthCode: cap("supported"),
  privacy: cap("supported"),
  dnssec: cap("unknown"),
  accountBalance: cap("supported"),
  domainStatus: cap("supported"),
  autoRenewControl: cap("limited"),
  providerEvents: cap("unsupported"),
});

export class FakeRegistrarProvider
  implements DomainRegistrarProvider
{
  readonly providerId = "fake";
  readonly mode: RegistrarMode;
  private readonly cfg: FakeConfig;

  constructor(cfg: FakeConfig = {}) {
    this.cfg = cfg;
    this.mode = cfg.mode ?? "namecheap_sandbox";
  }

  capabilities(): CapabilityMatrix {
    return { ...DEFAULT_CAPS(), ...(this.cfg.capabilities ?? {}) };
  }

  async checkAvailability(
    domains: string[],
  ): Promise<AvailabilityResult[]> {
    return domains.map((domain) => ({
      domain,
      available: true,
      isPremium: false,
      ...(this.cfg.availability?.[domain] ?? {}),
    }));
  }

  private price(tld: string, years: number): PriceResult {
    const per = this.cfg.priceByTld?.[tld];
    if (per == null) {
      throw new Error(`fake: no price for .${tld}`);
    }
    return {
      tld,
      years,
      cost: { amountMinor: per * years, currency: "USD" },
      isPremium: false,
    };
  }

  async getRegisterPrice(tld: string, years: number) {
    return this.price(tld, years);
  }
  async getRenewPrice(tld: string, years: number) {
    return this.price(tld, years);
  }
  async getTransferPrice(tld: string, years: number) {
    return this.price(tld, years);
  }
  async getRestorePrice(tld: string) {
    return this.price(tld, 1);
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const forced = this.cfg.registerResult?.[input.domain];
    if (forced) {
      return forced;
    }
    return {
      outcome: "definitive_success",
      registered: true,
      privacyEnabled: input.enablePrivacy,
      correlation: {
        domainId: `fake-${input.domain}`,
        orderId: `ord-${input.idempotencyKey}`,
        transactionId: `txn-${input.idempotencyKey}`,
        chargedMinor: this.cfg.priceByTld
          ? (this.cfg.priceByTld[input.domain.split(".").slice(1).join(".")] ??
              0) * input.years
          : undefined,
        currency: "USD",
      },
      providerCorrelationId: `fake-corr-${input.domain}`,
    };
  }

  async getRegistrationStatus(domain: string): Promise<DomainStatus> {
    return (
      this.cfg.status?.[domain] ?? {
        domain,
        registered: true,
        expiresAt: "2027-01-01T00:00:00Z",
      }
    );
  }

  async renew(
    domain: string,
    _years: number,
    idempotencyKey: string,
  ): Promise<RegisterResult> {
    return {
      outcome: "definitive_success",
      registered: true,
      correlation: { orderId: `renew-${idempotencyKey}`, domainId: domain },
    };
  }

  async getContacts(): Promise<Record<string, RegistrarContact>> {
    return {};
  }
  async getNameservers(): Promise<string[]> {
    return [];
  }
  async getRegistrarLock(): Promise<boolean> {
    return true;
  }
  async getExpiry(domain: string): Promise<DomainStatus> {
    return this.getRegistrationStatus(domain);
  }
  async getAccountBalance(): Promise<Money> {
    return { amountMinor: this.cfg.balanceMinor ?? 0, currency: "USD" };
  }
  async initiateInboundTransfer(
    domain: string,
    _epp: string,
    idempotencyKey: string,
  ): Promise<TransferStatusResult> {
    return {
      domain,
      state: "pending",
      correlation: { orderId: `xfer-${idempotencyKey}` },
    };
  }
  async getTransferStatus(domain: string): Promise<TransferStatusResult> {
    return { domain, state: "pending", correlation: {} };
  }
}
