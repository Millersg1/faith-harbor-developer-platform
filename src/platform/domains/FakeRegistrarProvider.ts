/**
 * A deterministic in-memory registrar for offline tests. It never touches the
 * network and lets a test script every outcome — including the dangerous ones
 * (ambiguous/unknown, registered=false, provider rejection) — so the saga and
 * reconciliation logic (later stages) can be proven without a real registrar.
 */

import type { RegistrarContact } from "./RegistrarContact";
import {
  type AuthCodeResult,
  type AvailabilityResult,
  type CapabilityMatrix,
  type DnsMutationResult,
  type DnsRecord,
  type DnsRecordChange,
  type DnssecInfo,
  type DomainRegistrarProvider,
  type DomainStatus,
  type Money,
  type PriceResult,
  type RegisterInput,
  type RegisterResult,
  type RegistrarMode,
  type RegistrarMutationResult,
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
  /** Override the currency returned by pricing (default USD) — for FX tests. */
  currency?: string;
  /** When true, getRegistrationStatus throws (models a provider timeout). */
  throwOnStatus?: boolean;
  /** ascii-domain -> forced renew result (to script renewal outcomes). */
  renewResult?: Record<string, RegisterResult>;
  /** When true, renew() throws (models a renewal transport timeout). */
  throwOnRenew?: boolean;
  /** ascii-domain -> seed current expiration date (ISO). */
  expiresAtByDomain?: Record<string, string>;
  /** ascii-domain -> expiration date after a successful renew (ISO). */
  renewedExpiresAt?: Record<string, string>;
  /** ascii-domain -> state returned by initiateInboundTransfer. */
  transferInitiate?: Record<string, import("./RegistrarProvider").TransferState>;
  /** ascii-domain -> state returned by getTransferStatus (polling). */
  transferStatus?: Record<string, import("./RegistrarProvider").TransferState>;
  /** When true, initiateInboundTransfer throws (models an ambiguous submission). */
  throwOnTransfer?: boolean;
  /** Auth-code delivery for requestAuthCode (default: emailed_to_registrant). */
  authCode?: { delivery: "returned" | "emailed_to_registrant" | "unsupported"; code?: string };
  /** When true, DNS mutations/reads throw (models a DNS provider timeout). */
  throwOnDns?: boolean;
  /** ascii-domain -> forced DNS mutation result (to script ambiguous/failure). */
  dnsResult?: Record<string, DnsMutationResult>;
  /** ascii-domain -> seed live zone records (reconciliation source). */
  dnsRecords?: Record<string, DnsRecord[]>;
  /** ascii-domain -> seed nameservers. */
  nameserversByDomain?: Record<string, string[]>;
  /** ascii-domain -> DNSSEC status. */
  dnssec?: Record<string, DnssecInfo>;
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
  /** Mutable in-memory zones + nameservers, so applied changes are observable. */
  private readonly zones = new Map<string, DnsRecord[]>();
  private readonly ns = new Map<string, string[]>();
  /** Mutable expiration dates, so a successful renew advances them. */
  private readonly expiry = new Map<string, string>();

  constructor(cfg: FakeConfig = {}) {
    this.cfg = cfg;
    this.mode = cfg.mode ?? "namecheap_sandbox";
    for (const [d, recs] of Object.entries(cfg.dnsRecords ?? {})) {
      this.zones.set(d, recs.map((r) => ({ ...r })));
    }
    for (const [d, n] of Object.entries(cfg.nameserversByDomain ?? {})) {
      this.ns.set(d, [...n]);
    }
    for (const [d, at] of Object.entries(cfg.expiresAtByDomain ?? {})) {
      this.expiry.set(d, at);
    }
  }

  /** Test helper: simulate the provider having actually advanced the expiry
   *  (e.g. an ambiguous renew that in fact succeeded at the provider). */
  setExpiry(domain: string, at: string): void {
    this.expiry.set(domain, at);
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
      cost: { amountMinor: per * years, currency: this.cfg.currency ?? "USD" },
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
    if (this.cfg.throwOnStatus) {
      throw new Error("provider timeout");
    }
    const scripted = this.cfg.status?.[domain];
    return {
      domain,
      registered: scripted?.registered ?? true,
      // The mutable expiry map wins so a successful renew is observable.
      expiresAt: this.expiry.get(domain) ?? scripted?.expiresAt ?? "2027-01-01T00:00:00Z",
      ...(scripted ? { lifecycleState: scripted.lifecycleState } : {}),
    };
  }

  async renew(
    domain: string,
    _years: number,
    idempotencyKey: string,
  ): Promise<RegisterResult> {
    if (this.cfg.throwOnRenew) {
      throw new Error("renew transport timeout");
    }
    const forced = this.cfg.renewResult?.[domain];
    const result: RegisterResult = forced ?? {
      outcome: "definitive_success",
      registered: true,
      correlation: { orderId: `renew-${idempotencyKey}`, domainId: domain },
      providerCorrelationId: `fake-renew-${domain}`,
    };
    // Only a DEFINITIVE success advances the (mutable) expiry the provider will
    // report. Ambiguous/failed renews leave it unchanged unless a test scripts
    // the provider having actually acted via setExpiry().
    if (result.outcome === "definitive_success" && result.registered) {
      const next =
        this.cfg.renewedExpiresAt?.[domain] ??
        advanceOneYear(this.expiry.get(domain) ?? "2027-01-01T00:00:00Z");
      this.expiry.set(domain, next);
    }
    return result;
  }

  async getContacts(): Promise<Record<string, RegistrarContact>> {
    return {};
  }
  async getNameservers(domain: string): Promise<string[]> {
    if (this.cfg.throwOnDns) throw new Error("dns provider timeout");
    return this.ns.get(domain) ?? [];
  }

  // ---- DNS (Stage 8) ------------------------------------------------------
  async setNameservers(
    domain: string,
    nameservers: string[],
    _idempotencyKey: string,
  ): Promise<DnsMutationResult> {
    if (this.cfg.throwOnDns) throw new Error("dns provider timeout");
    const forced = this.cfg.dnsResult?.[domain];
    if (forced) return forced;
    this.ns.set(domain, [...nameservers]);
    return { outcome: "definitive_success", applied: true, providerCorrelationId: `fake-ns-${domain}` };
  }

  async getDnsRecords(domain: string): Promise<DnsRecord[]> {
    if (this.cfg.throwOnDns) throw new Error("dns provider timeout");
    return (this.zones.get(domain) ?? []).map((r) => ({ ...r }));
  }

  async applyDnsRecords(
    domain: string,
    changes: DnsRecordChange[],
    _idempotencyKey: string,
  ): Promise<DnsMutationResult> {
    if (this.cfg.throwOnDns) throw new Error("dns provider timeout");
    const forced = this.cfg.dnsResult?.[domain];
    if (forced) return forced; // scripted ambiguous/failure — do NOT mutate the zone
    const zone = this.zones.get(domain) ?? [];
    const same = (a: DnsRecord, b: Pick<DnsRecord, "type" | "host" | "value">) =>
      a.type === b.type && a.host === b.host && a.value === b.value;
    for (const change of changes) {
      if (change.op === "delete") {
        const idx = zone.findIndex((r) => same(r, change.record));
        if (idx >= 0) zone.splice(idx, 1);
      } else {
        const idx = zone.findIndex(
          (r) => r.type === change.record.type && r.host === change.record.host,
        );
        if (idx >= 0 && change.record.type !== "MX" && change.record.type !== "TXT") {
          zone[idx] = { ...change.record };
        } else if (!zone.some((r) => same(r, change.record))) {
          zone.push({ ...change.record });
        }
      }
    }
    this.zones.set(domain, zone);
    return { outcome: "definitive_success", applied: true, providerCorrelationId: `fake-dns-${domain}` };
  }

  async getDnssec(domain: string): Promise<DnssecInfo> {
    if (this.cfg.throwOnDns) throw new Error("dns provider timeout");
    return this.cfg.dnssec?.[domain] ?? { supported: true, enabled: false, status: "unsigned" };
  }
  /** Mutable transfer-lock state, so lock/unlock is observable. */
  private readonly locked = new Map<string, boolean>();
  async getRegistrarLock(domain: string): Promise<boolean> {
    return this.locked.get(domain) ?? true; // domains are locked by default
  }
  async setRegistrarLock(
    domain: string,
    locked: boolean,
    _idempotencyKey: string,
  ): Promise<RegistrarMutationResult> {
    this.locked.set(domain, locked);
    return { outcome: "definitive_success", applied: true, providerCorrelationId: `fake-lock-${domain}` };
  }
  async requestAuthCode(domain: string): Promise<AuthCodeResult> {
    // Default models NameSilo: the code is EMAILED to the registrant, never
    // returned via API — so the platform has nothing to store/display/log.
    return this.cfg.authCode ?? { delivery: "emailed_to_registrant", providerCorrelationId: `fake-epp-${domain}` };
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
    if (this.cfg.throwOnTransfer) throw new Error("transfer submit timeout");
    return {
      domain,
      state: this.cfg.transferInitiate?.[domain] ?? "pending",
      correlation: { orderId: `xfer-${idempotencyKey}` },
    };
  }
  async getTransferStatus(domain: string): Promise<TransferStatusResult> {
    if (this.cfg.throwOnStatus) throw new Error("provider timeout");
    return { domain, state: this.cfg.transferStatus?.[domain] ?? "pending", correlation: {} };
  }
}

/** Advances an ISO date by one calendar year (deterministic, no Date.now). */
function advanceOneYear(iso: string): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}
