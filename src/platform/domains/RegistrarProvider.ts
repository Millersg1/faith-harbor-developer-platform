/**
 * Provider-neutral registrar boundary for the domain-registration subsystem.
 *
 * Everything the platform does to a registrar goes through this interface, so
 * the concrete registrar (Namecheap first) can be replaced without touching the
 * platform. The interface is honest about capability: a provider/TLD that does
 * not support a feature returns an explicit `unsupported` capability result
 * rather than throwing a generic error, and every registrar action returns a
 * bounded, sanitized outcome — never a raw provider error body.
 *
 * Money is ALWAYS integer minor units (cents) + a currency code. No floating
 * point. Amounts here are the provider's chargeable cost; customer-facing
 * markup lives elsewhere (Stage 4), never in the provider layer.
 */

import type { RegistrarContact } from "./RegistrarContact";

export type Money = {
  amountMinor: number;
  currency: string;
};

/**
 * Why a successful (HTTP 2xx, provider-accepted) response nonetheless yielded no
 * usable balance. A missing/empty/duplicated/malformed/negative/unknown-currency
 * balance is NEVER represented as a numeric zero — it is a distinct, fail-closed
 * `unavailable` result so callers cannot mistake absent data for "0.00".
 */
export type BalanceUnavailableReason =
  | "missing_balance_element"
  | "empty_balance"
  | "duplicate_balance_elements"
  | "malformed_balance"
  | "non_finite_balance"
  | "negative_balance"
  | "currency_unknown";

/**
 * The honest outcome of an account-balance read. Provider REJECTION (an accepted
 * request the provider refused) and TRANSPORT failure are thrown as their
 * existing error types — they are NOT folded in here — so all six states stay
 * distinct: confirmed-zero, confirmed-positive (both `available`),
 * malformed/incomplete success (`unavailable`), unsupported (`unsupported`),
 * plus the two thrown categories.
 */
export type AccountBalanceResult =
  | { status: "available"; amountMinor: number; currency: string }
  | { status: "unavailable"; reason: BalanceUnavailableReason }
  | { status: "unsupported" };

/** The registrar features we introspect. */
export type CapabilityKey =
  | "availability"
  | "pricing"
  | "premiumDetection"
  | "registration"
  | "nonRealtimeRegistration"
  | "renewal"
  | "restoration"
  | "incomingTransfer"
  | "transferStatus"
  | "contactManagement"
  | "registrantChange"
  | "nameservers"
  | "dnsRecords"
  | "lockUnlock"
  | "eppAuthCode"
  | "privacy"
  | "dnssec"
  | "accountBalance"
  | "domainStatus"
  | "autoRenewControl"
  | "providerEvents";

export type CapabilityStatus =
  | "supported"
  | "unsupported"
  | "limited"
  | "unknown";

export interface CapabilityInfo {
  status: CapabilityStatus;
  /** The provider API command/endpoint that backs it (evidence anchor). */
  apiCommand?: string;
  /** "docs" = per official API reference; "sandbox" = verified live in sandbox. */
  evidence: "docs" | "sandbox" | "none";
  note?: string;
}

export type CapabilityMatrix = Record<CapabilityKey, CapabilityInfo>;

/**
 * The five honest outcomes of any state-changing registrar call. This is the
 * financial-safety contract: an `unknown` outcome MUST NOT be blindly retried.
 */
export type RegistrarOutcome =
  | "definitive_success"
  | "definitive_failure"
  | "provider_rejection"
  | "transport_failure_pre_acceptance"
  | "ambiguous_unknown";

/** Sanitized correlation values captured from a provider response. */
export interface ProviderCorrelation {
  /** Provider's charged amount, if the response stated one (minor units). */
  chargedMinor?: number;
  currency?: string;
  domainId?: string;
  orderId?: string;
  transactionId?: string;
}

export interface AvailabilityResult {
  domain: string;
  available: boolean;
  isPremium: boolean;
  /** Exact premium registration price when premium (minor units). */
  premiumRegisterPrice?: Money;
  premiumRenewPrice?: Money;
}

export interface PriceResult {
  domain?: string;
  tld: string;
  years: number;
  /** The provider's chargeable amount for the operation (our cost). */
  cost: Money;
  isPremium: boolean;
}

export interface RegisterInput {
  /** Canonical ASCII domain. */
  domain: string;
  years: number;
  contacts: {
    registrant: RegistrarContact;
    admin: RegistrarContact;
    tech: RegistrarContact;
    billing: RegistrarContact;
  };
  nameservers?: string[];
  enablePrivacy: boolean;
  /** True when the caller has confirmed this is a premium purchase. */
  premiumAcknowledged?: boolean;
  /** Exact premium price the customer accepted (minor units), if premium. */
  acceptedPremiumMinor?: number;
  /** Idempotency key: (tenant, ascii-domain, attempt). */
  idempotencyKey: string;
}

export interface RegisterResult {
  outcome: RegistrarOutcome;
  /** Registrar confirmed the domain is registered (only true on success). */
  registered: boolean;
  correlation: ProviderCorrelation;
  /** Confirmed privacy state after registration, when known. */
  privacyEnabled?: boolean;
  /** Bounded, sanitized error category — never a raw provider body. */
  errorCategory?: string;
  /** Provider correlation id for support (safe to store/show to admins). */
  providerCorrelationId?: string;
}

export interface DomainStatus {
  domain: string;
  registered: boolean;
  expiresAt?: string;
  locked?: boolean;
  privacyEnabled?: boolean;
  autoRenew?: boolean;
  nameservers?: string[];
  /** Redemption / pending-delete etc. as reported by the provider. */
  lifecycleState?: string;
}

// ---- DNS & nameservers (Stage 8) -----------------------------------------

/** Nameserver delegation mode for a confirmed registration. */
export type NameserverMode = "allelite" | "registrar_default" | "custom";

/** DNS record types the platform manages. Provider support varies by TLD. */
export type DnsRecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "TXT"
  | "NS"
  | "SRV"
  | "CAA"
  | "ALIAS";

export interface DnsRecord {
  /** Provider record id, when the provider assigns one (for update/delete). */
  providerRecordId?: string;
  type: DnsRecordType;
  /** Host label relative to the zone apex ("@" = apex). */
  host: string;
  value: string;
  /** Seconds. */
  ttl: number;
  /** MX / SRV priority. */
  priority?: number;
}

/** A requested change to a zone. Providers map these to their own API shape. */
export type DnsRecordChange =
  | { op: "upsert"; record: DnsRecord }
  | {
      op: "delete";
      record: Pick<DnsRecord, "type" | "host" | "value" | "providerRecordId">;
    };

/**
 * The outcome of a DNS mutation. Carries the same five-way honesty contract as
 * registration: an `ambiguous_unknown` DNS change is NEVER blindly retried and
 * the platform makes NO automatic-rollback promise — it reconciles by reading
 * the live zone.
 */
export interface DnsMutationResult {
  outcome: RegistrarOutcome;
  applied: boolean;
  providerCorrelationId?: string;
  errorCategory?: string;
}

export interface DnssecInfo {
  supported: boolean;
  enabled: boolean;
  /** Sanitized status label only; DS/key material is never surfaced here. */
  status?: string;
}

// ---- Transfers (Stage 10) -------------------------------------------------

/** Generic five-way-outcome result for a registrar mutation (lock/unlock etc.). */
export interface RegistrarMutationResult {
  outcome: RegistrarOutcome;
  applied: boolean;
  providerCorrelationId?: string;
  errorCategory?: string;
}

/**
 * The result of requesting a domain's transfer-away authorization (EPP) code.
 * SECURITY: some registrars (NameSilo) EMAIL the code to the registrant and never
 * return it through the API — in that case `code` MUST stay undefined and the
 * platform never stores/displays/logs it.
 */
export interface AuthCodeResult {
  delivery: "returned" | "emailed_to_registrant" | "unsupported";
  /** Present ONLY when the provider actually returns the code via API. */
  code?: string;
  providerCorrelationId?: string;
}

export type TransferState =
  | "pending"
  | "approved"
  | "rejected"
  | "failed"
  | "completed"
  | "unknown";

export interface TransferStatusResult {
  domain: string;
  state: TransferState;
  correlation: ProviderCorrelation;
}

/** A capability the provider does not support returns this instead of throwing. */
export class CapabilityUnsupportedError extends Error {
  constructor(
    readonly capability: CapabilityKey,
    message?: string,
  ) {
    super(message ?? `Capability unsupported: ${capability}.`);
    this.name = "CapabilityUnsupportedError";
  }
}

/** The registrar is disabled or in a mode that forbids this operation. */
export class RegistrarModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrarModeError";
  }
}

/**
 * The provider-neutral registrar. Read methods are safe; state-changing methods
 * return a {@link RegistrarOutcome}. Implementations must be server-side only
 * and never leak credentials through any return value, error, or log.
 */
export interface DomainRegistrarProvider {
  /** Which registrar this is (e.g. "namecheap"), for audit/labeling. */
  readonly providerId: string;
  /** Sandbox vs live vs disabled. */
  readonly mode: RegistrarMode;

  capabilities(): CapabilityMatrix;

  checkAvailability(domainsAscii: string[]): Promise<AvailabilityResult[]>;
  getRegisterPrice(tld: string, years: number): Promise<PriceResult>;
  getRenewPrice(tld: string, years: number): Promise<PriceResult>;
  getTransferPrice(tld: string, years: number): Promise<PriceResult>;
  /** Redemption/restore price. May be `unsupported` on some providers. */
  getRestorePrice(tld: string): Promise<PriceResult>;

  register(input: RegisterInput): Promise<RegisterResult>;
  /** Reconcile an uncertain registration by looking the domain/order up. */
  getRegistrationStatus(domainAscii: string): Promise<DomainStatus>;

  renew(domainAscii: string, years: number, idempotencyKey: string): Promise<RegisterResult>;

  getContacts(domainAscii: string): Promise<Record<string, RegistrarContact>>;
  getNameservers(domainAscii: string): Promise<string[]>;
  getRegistrarLock(domainAscii: string): Promise<boolean>;
  getExpiry(domainAscii: string): Promise<DomainStatus>;
  /**
   * Reads the registrar account balance. Returns a distinct `unavailable` result
   * (never a fabricated zero) when a successful response carries no usable
   * balance; throws the provider REJECTION / TRANSPORT / parse errors otherwise.
   */
  getAccountBalance(): Promise<AccountBalanceResult>;

  // ---- DNS & nameservers (only reachable AFTER confirmed registration) ----
  /** Sets the domain's nameservers. Mutation → five-way outcome. */
  setNameservers(
    domainAscii: string,
    nameservers: string[],
    idempotencyKey: string,
  ): Promise<DnsMutationResult>;
  /** Reads the live zone records (read-only reconciliation source of truth). */
  getDnsRecords(domainAscii: string): Promise<DnsRecord[]>;
  /** Applies a bounded set of zone changes. Mutation → five-way outcome. */
  applyDnsRecords(
    domainAscii: string,
    changes: DnsRecordChange[],
    idempotencyKey: string,
  ): Promise<DnsMutationResult>;
  /** Reads DNSSEC status (never returns DS/key material). */
  getDnssec(domainAscii: string): Promise<DnssecInfo>;

  /** Incoming transfer (kept behind its own fail-closed flag by callers). */
  initiateInboundTransfer(
    domainAscii: string,
    eppCode: string,
    idempotencyKey: string,
  ): Promise<TransferStatusResult>;
  getTransferStatus(domainAscii: string): Promise<TransferStatusResult>;

  // ---- outgoing-transfer support (owner-only, deliberate; Stage 10) -------
  /** Sets the registrar transfer lock (unlock to allow transfer-away). */
  setRegistrarLock(
    domainAscii: string,
    locked: boolean,
    idempotencyKey: string,
  ): Promise<RegistrarMutationResult>;
  /**
   * Requests the transfer-away authorization (EPP) code. Returns the code ONLY
   * if the provider returns it via API; NameSilo emails it to the registrant and
   * returns `delivery: "emailed_to_registrant"` with no code.
   */
  requestAuthCode(domainAscii: string): Promise<AuthCodeResult>;
}

export type RegistrarMode =
  | "disabled"
  | "namesilo_sandbox"
  | "namesilo_live"
  | "namecheap_sandbox"
  | "namecheap_live";

export function parseRegistrarMode(raw: string | undefined): RegistrarMode {
  switch ((raw ?? "").trim()) {
    case "namesilo_sandbox":
      return "namesilo_sandbox";
    case "namesilo_live":
      return "namesilo_live";
    case "namecheap_sandbox":
      return "namecheap_sandbox";
    case "namecheap_live":
      return "namecheap_live";
    default:
      // Fail closed: anything unset/unknown is disabled.
      return "disabled";
  }
}
