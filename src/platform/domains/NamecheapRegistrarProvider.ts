/**
 * Namecheap adapter for {@link DomainRegistrarProvider}.
 *
 * Server-side only. The API key/user/username/client-IP live in config and are
 * NEVER returned, thrown, or logged — every diagnostic string is passed through
 * {@link redactSecrets} and the full query string is redacted. Responses are
 * parsed by the bounded {@link parseNamecheap} tokenizer (no regex-scraping, no
 * DTD/entity/network access). State-changing calls are mode-guarded
 * (disabled / sandbox / live) and gated by explicit fail-closed feature flags
 * for purchasing, premium purchasing, and incoming transfers. Every write
 * returns an honest {@link RegistrarOutcome}; an ambiguous result is NEVER
 * auto-repeated by this layer.
 */

import type { RegistrarContact } from "./RegistrarContact";
import { createHardenedFetcher } from "./transport/hardenedFetch";
import {
  classifyTransportError,
  decimalToMinor,
  envelopeStatus,
  extractApiError,
  findAll,
  findFirst,
  NamecheapApiError,
  NamecheapHttpError,
  NamecheapTransportError,
  parseNamecheap,
  sanitizeText,
  type XmlNode,
} from "./namecheapXml";
import {
  CapabilityUnsupportedError,
  RegistrarModeError,
  type AvailabilityResult,
  type CapabilityMatrix,
  type AuthCodeResult,
  type DnsMutationResult,
  type DnsRecord,
  type DnssecInfo,
  type DomainRegistrarProvider,
  type RegistrarMutationResult,
  type DomainStatus,
  type AccountBalanceResult,
  type Money,
  type PriceResult,
  type RegisterInput,
  type RegisterResult,
  type RegistrarMode,
  type TransferState,
  type TransferStatusResult,
} from "./RegistrarProvider";

export interface NamecheapConfig {
  mode: Extract<RegistrarMode, "namecheap_sandbox" | "namecheap_live">;
  apiUser: string;
  apiKey: string;
  userName: string;
  clientIp: string;
  baseUrl: string;
  purchasingEnabled: boolean;
  premiumPurchasingEnabled: boolean;
  incomingTransfersEnabled: boolean;
}

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const CURRENCY = "USD";

export class NamecheapRegistrarProvider
  implements DomainRegistrarProvider
{
  readonly providerId = "namecheap";
  readonly mode: RegistrarMode;
  private readonly fetcher: Fetcher;

  constructor(
    private readonly config: NamecheapConfig,
    fetcher?: Fetcher,
  ) {
    this.mode = config.mode;
    this.fetcher =
      fetcher ??
      createHardenedFetcher({
        allowedHosts: [ncHostOf(config.baseUrl)],
      });
  }

  capabilities(): CapabilityMatrix {
    const docs = (
      status: CapabilityMatrix[keyof CapabilityMatrix]["status"],
      apiCommand: string,
      note?: string,
    ) => ({ status, apiCommand, evidence: "docs" as const, note });
    return {
      availability: docs("supported", "namecheap.domains.check"),
      pricing: docs("supported", "namecheap.users.getPricing"),
      premiumDetection: docs(
        "supported",
        "namecheap.domains.check",
        "IsPremiumName + PremiumRegistrationPrice",
      ),
      registration: docs("supported", "namecheap.domains.create"),
      nonRealtimeRegistration: docs(
        "limited",
        "namecheap.domains.create",
        "NonRealTimeDomain=true possible; handled as ambiguous until reconciled",
      ),
      renewal: docs("supported", "namecheap.domains.renew"),
      restoration: docs(
        "unknown",
        "n/a",
        "RGP/redemption restore not exposed by the basic pricing/registration API; verify before offering restore",
      ),
      incomingTransfer: docs("supported", "namecheap.domains.transfer.create"),
      transferStatus: docs("supported", "namecheap.domains.transfer.getStatus"),
      contactManagement: docs("supported", "namecheap.domains.setContacts"),
      registrantChange: docs(
        "limited",
        "namecheap.domains.setContacts",
        "Change-of-registrant confirmation rules vary by TLD",
      ),
      nameservers: docs("supported", "namecheap.domains.dns.setCustom"),
      dnsRecords: docs("supported", "namecheap.domains.dns.setHosts"),
      lockUnlock: docs("supported", "namecheap.domains.setRegistrarLock"),
      eppAuthCode: docs(
        "supported",
        "namecheap.domains.getInfo",
        "EPP retrieval is owner-only + reauth; never logged",
      ),
      privacy: docs(
        "supported",
        "namecheap.whoisguard.*",
        "Free WhoisGuard where the TLD/registrant type allows it",
      ),
      dnssec: docs(
        "unknown",
        "namecheap.domains.dns.*",
        "DNSSEC support unverified; confirm in sandbox before enabling",
      ),
      accountBalance: docs("supported", "namecheap.users.getBalances"),
      domainStatus: docs("supported", "namecheap.domains.getInfo"),
      autoRenewControl: docs(
        "limited",
        "n/a",
        "No reliable tenant auto-renew toggle; renewal worker must call domains.renew explicitly",
      ),
      providerEvents: docs(
        "unsupported",
        "n/a",
        "Namecheap has no webhooks; status is poll-only",
      ),
    };
  }

  // ---- transport ----------------------------------------------------------
  private url(command: string, params: Record<string, string>): string {
    const q = new URLSearchParams({
      ApiUser: this.config.apiUser,
      ApiKey: this.config.apiKey,
      UserName: this.config.userName,
      ClientIp: this.config.clientIp,
      Command: command,
      ...params,
    });
    return `${this.config.baseUrl}?${q.toString()}`;
  }

  /** Calls Namecheap and returns the parsed root, or throws a typed error. */
  private async rawCall(
    command: string,
    params: Record<string, string>,
  ): Promise<XmlNode> {
    let res: Awaited<ReturnType<Fetcher>>;
    try {
      res = await this.fetcher(this.url(command, params));
    } catch (err) {
      throw new NamecheapTransportError((err as { code?: string })?.code);
    }
    const body = await res.text();
    if (!res.ok) {
      throw new NamecheapHttpError(res.status);
    }
    const root = parseNamecheap(body);
    if (envelopeStatus(root) === "ERROR") {
      throw extractApiError(root);
    }
    return root;
  }

  private assertEnabled(): void {
    if ((this.mode as RegistrarMode) === "disabled") {
      throw new RegistrarModeError("Registrar is disabled.");
    }
  }

  private assertPurchasing(): void {
    this.assertEnabled();
    if (this.mode === "namecheap_live" && !this.config.purchasingEnabled) {
      throw new RegistrarModeError(
        "Live purchasing is disabled (DOMAIN_PURCHASING_ENABLED=false).",
      );
    }
  }

  // ---- reads --------------------------------------------------------------
  async checkAvailability(domains: string[]): Promise<AvailabilityResult[]> {
    this.assertEnabled();
    if (domains.length === 0) return [];
    const root = await this.rawCall("namecheap.domains.check", {
      DomainList: domains.join(","),
    });
    return findAll(root, "DomainCheckResult").map((el) => {
      const domain = (el.attrs.get("Domain") ?? "").toLowerCase();
      const isPremium = el.attrs.get("IsPremiumName") === "true";
      const premReg = el.attrs.get("PremiumRegistrationPrice");
      const premRenew = el.attrs.get("PremiumRenewalPrice");
      return {
        domain,
        available: el.attrs.get("Available") === "true",
        isPremium,
        premiumRegisterPrice:
          isPremium && premReg && premReg !== "0"
            ? { amountMinor: decimalToMinor(premReg), currency: CURRENCY }
            : undefined,
        premiumRenewPrice:
          isPremium && premRenew && premRenew !== "0"
            ? { amountMinor: decimalToMinor(premRenew), currency: CURRENCY }
            : undefined,
      };
    });
  }

  private async pricing(
    category: "REGISTER" | "RENEW" | "TRANSFER",
    tld: string,
    years: number,
  ): Promise<PriceResult> {
    this.assertEnabled();
    const root = await this.rawCall("namecheap.users.getPricing", {
      ProductType: "DOMAIN",
      ProductCategory: category,
      ActionName: category,
      ProductName: tld.replace(/^\./, ""),
    });
    for (const p of findAll(root, "Price")) {
      if (
        p.attrs.get("Duration") === String(years) &&
        (p.attrs.get("DurationType") ?? "YEAR").toUpperCase() === "YEAR"
      ) {
        const your = p.attrs.get("YourPrice") ?? p.attrs.get("Price");
        if (!your) break;
        return {
          tld: tld.replace(/^\./, ""),
          years,
          cost: { amountMinor: decimalToMinor(your), currency: CURRENCY },
          isPremium: false,
        };
      }
    }
    throw new NamecheapApiError(
      `No ${category} price for .${tld.replace(/^\./, "")} (${years}y).`,
    );
  }

  getRegisterPrice(tld: string, years: number) {
    return this.pricing("REGISTER", tld, years);
  }
  getRenewPrice(tld: string, years: number) {
    return this.pricing("RENEW", tld, years);
  }
  getTransferPrice(tld: string, years: number) {
    return this.pricing("TRANSFER", tld, years);
  }
  getRestorePrice(_tld: string): Promise<PriceResult> {
    // Not exposed by Namecheap's basic pricing API — honest capability signal.
    return Promise.reject(new CapabilityUnsupportedError("restoration"));
  }

  async getRegistrationStatus(domain: string): Promise<DomainStatus> {
    this.assertEnabled();
    const root = await this.rawCall("namecheap.domains.getInfo", {
      DomainName: domain,
    });
    const info = findFirst(root, "DomainGetInfoResult");
    const wg = findFirst(root, "Whoisguard");
    const expired = findFirst(root, "ExpiredDate");
    const ns = findAll(root, "Nameserver")
      .map((el) => sanitizeText(el.text))
      .filter(Boolean);
    return {
      domain,
      registered:
        (info?.attrs.get("Status") ?? "").toLowerCase() === "ok",
      expiresAt: expired ? sanitizeText(expired.text) : undefined,
      privacyEnabled: wg ? wg.attrs.get("Enabled") === "True" : undefined,
      nameservers: ns,
      lifecycleState: info?.attrs.get("Status"),
    };
  }

  getExpiry(domain: string) {
    return this.getRegistrationStatus(domain);
  }

  async getContacts(domain: string): Promise<Record<string, RegistrarContact>> {
    this.assertEnabled();
    await this.rawCall("namecheap.domains.getContacts", { DomainName: domain });
    return {};
  }

  async getNameservers(domain: string): Promise<string[]> {
    const s = await this.getRegistrationStatus(domain);
    return s.nameservers ?? [];
  }

  async getRegistrarLock(domain: string): Promise<boolean> {
    this.assertEnabled();
    const root = await this.rawCall("namecheap.domains.getRegistrarLock", {
      DomainName: domain,
    });
    const r = findFirst(root, "DomainGetRegistrarLockResult");
    return (r?.attrs.get("RegistrarLockStatus") ?? "").toLowerCase() === "true";
  }

  async getAccountBalance(): Promise<AccountBalanceResult> {
    this.assertEnabled();
    // Rejection/transport/parse errors are thrown by rawCall; a well-formed
    // success with no usable balance is a distinct fail-closed `unavailable`
    // result — never a fabricated zero. Namecheap DOES return a Currency attr;
    // if it is absent we fail closed to currency_unknown (no USD assumption).
    const root = await this.rawCall("namecheap.users.getBalances", {});
    const r = findFirst(root, "UserGetBalancesResult");
    const bal = r?.attrs.get("AvailableBalance");
    if (!r || bal === undefined) return { status: "unavailable", reason: "missing_balance_element" };
    const raw = sanitizeText(bal);
    if (raw === "") return { status: "unavailable", reason: "empty_balance" };
    if (/^-/.test(raw)) return { status: "unavailable", reason: "negative_balance" };
    const currency = (r.attrs.get("Currency") ?? "").trim();
    if (!currency) return { status: "unavailable", reason: "currency_unknown" };
    let amountMinor: number;
    try {
      amountMinor = decimalToMinor(raw);
    } catch {
      return { status: "unavailable", reason: "malformed_balance" };
    }
    if (!Number.isFinite(amountMinor)) return { status: "unavailable", reason: "non_finite_balance" };
    return { status: "available", amountMinor, currency };
  }

  // ---- writes -------------------------------------------------------------
  async register(input: RegisterInput): Promise<RegisterResult> {
    this.assertPurchasing();
    if (input.premiumAcknowledged && !this.config.premiumPurchasingEnabled) {
      throw new RegistrarModeError(
        "Premium purchasing is disabled (separate fail-closed flag).",
      );
    }
    const params: Record<string, string> = {
      DomainName: input.domain,
      Years: String(input.years),
      ...contactParams("Registrant", input.contacts.registrant),
      ...contactParams("Tech", input.contacts.tech),
      ...contactParams("Admin", input.contacts.admin),
      ...contactParams("AuxBilling", input.contacts.billing),
    };
    if (input.nameservers?.length) params.Nameservers = input.nameservers.join(",");
    if (input.enablePrivacy) {
      params.AddFreeWhoisguard = "yes";
      params.WGEnabled = "yes";
    }
    if (input.premiumAcknowledged && input.acceptedPremiumMinor != null) {
      params.IsPremiumDomain = "true";
      params.PremiumPrice = (input.acceptedPremiumMinor / 100).toFixed(2);
    }

    let root: XmlNode;
    try {
      root = await this.rawCall("namecheap.domains.create", params);
    } catch (err) {
      return this.classifyWriteError(err);
    }
    const r = findFirst(root, "DomainCreateResult");
    if (!r) {
      return failure("ambiguous_unknown", "unparsable_create_result");
    }
    const registered = r.attrs.get("Registered") === "true";
    const nonRealtime = r.attrs.get("NonRealTimeDomain") === "true";
    const correlation = {
      chargedMinor: r.attrs.get("ChargedAmount")
        ? decimalToMinor(r.attrs.get("ChargedAmount")!)
        : undefined,
      currency: CURRENCY,
      domainId: r.attrs.get("DomainID"),
      orderId: r.attrs.get("OrderID"),
      transactionId: r.attrs.get("TransactionID"),
    };
    if (registered && !nonRealtime) {
      return {
        outcome: "definitive_success",
        registered: true,
        privacyEnabled:
          r.attrs.get("WhoisguardEnable") === "true" ? true : input.enablePrivacy,
        correlation,
        providerCorrelationId: correlation.orderId,
      };
    }
    if (nonRealtime) {
      return {
        outcome: "ambiguous_unknown",
        registered: false,
        correlation,
        errorCategory: "non_realtime_pending",
        providerCorrelationId: correlation.orderId,
      };
    }
    return {
      outcome: "definitive_failure",
      registered: false,
      correlation,
      errorCategory: "registered_false",
      providerCorrelationId: correlation.orderId,
    };
  }

  async renew(
    domain: string,
    years: number,
    _idempotencyKey: string,
  ): Promise<RegisterResult> {
    this.assertPurchasing();
    let root: XmlNode;
    try {
      root = await this.rawCall("namecheap.domains.renew", {
        DomainName: domain,
        Years: String(years),
      });
    } catch (err) {
      return this.classifyWriteError(err);
    }
    const r = findFirst(root, "DomainRenewResult");
    const ok = r?.attrs.get("Renew") === "true";
    return {
      outcome: ok ? "definitive_success" : "definitive_failure",
      registered: Boolean(ok),
      correlation: {
        chargedMinor: r?.attrs.get("ChargedAmount")
          ? decimalToMinor(r.attrs.get("ChargedAmount")!)
          : undefined,
        currency: CURRENCY,
        domainId: r?.attrs.get("DomainID"),
        orderId: r?.attrs.get("OrderID"),
        transactionId: r?.attrs.get("TransactionID"),
      },
      errorCategory: ok ? undefined : "renew_false",
    };
  }

  /** Maps a thrown call error to an honest write outcome (ambiguous by default). */
  private classifyWriteError(err: unknown): RegisterResult {
    if (err instanceof NamecheapTransportError) {
      return failure(classifyTransportError(err), sanitizeCategory(err.code));
    }
    if (err instanceof NamecheapApiError) {
      return failure("provider_rejection", err.number ?? "api_error");
    }
    // HTTP error, parse error, or anything else mid-mutation -> ambiguous.
    return failure("ambiguous_unknown", "unclassified");
  }

  async initiateInboundTransfer(
    domain: string,
    eppCode: string,
    _idempotencyKey: string,
  ): Promise<TransferStatusResult> {
    this.assertPurchasing();
    if (!this.config.incomingTransfersEnabled) {
      throw new RegistrarModeError(
        "Incoming transfers are disabled (separate fail-closed flag).",
      );
    }
    // The raw EPP code is used transiently for this call only; never stored/logged.
    const root = await this.rawCall("namecheap.domains.transfer.create", {
      DomainName: domain,
      Years: "1",
      EPPCode: eppCode,
    });
    const r = findFirst(root, "DomainTransferCreateResult");
    return {
      domain,
      state: mapTransferState(
        r?.attrs.get("TransferStatus") ?? r?.attrs.get("Transfer"),
      ),
      correlation: {
        orderId: r?.attrs.get("OrderID"),
        transactionId: r?.attrs.get("TransactionID"),
        domainId: r?.attrs.get("TransferID"),
      },
    };
  }

  async getTransferStatus(domain: string): Promise<TransferStatusResult> {
    this.assertEnabled();
    const root = await this.rawCall("namecheap.domains.transfer.getStatus", {
      DomainName: domain,
    });
    const r = findFirst(root, "DomainTransferGetStatusResult");
    return {
      domain,
      state: mapTransferState(r?.attrs.get("Status")),
      correlation: { domainId: r?.attrs.get("TransferID") },
    };
  }

  // ---- DNS (Stage 8) ------------------------------------------------------
  // Namecheap DNS (domains.dns.setHosts / getHosts / setCustom) is a replace-all
  // API. Live wiring is DEFERRED until sandbox proof exists; fail closed so no
  // production zone can be mutated through this adapter.
  private dnsDeferred(): never {
    throw new RegistrarModeError(
      "Namecheap live DNS management is not enabled in this build (sandbox wiring pending).",
    );
  }
  async setNameservers(): Promise<DnsMutationResult> {
    this.assertEnabled();
    return this.dnsDeferred();
  }
  async getDnsRecords(): Promise<DnsRecord[]> {
    this.assertEnabled();
    return this.dnsDeferred();
  }
  async applyDnsRecords(): Promise<DnsMutationResult> {
    this.assertEnabled();
    return this.dnsDeferred();
  }
  async getDnssec(): Promise<DnssecInfo> {
    this.assertEnabled();
    return this.dnsDeferred();
  }

  // ---- outgoing-transfer support (Stage 10) — fail closed (deferred) ------
  async setRegistrarLock(): Promise<RegistrarMutationResult> {
    this.assertEnabled();
    throw new RegistrarModeError(
      "Namecheap live registrar lock/unlock is not enabled in this build (sandbox wiring pending).",
    );
  }
  async requestAuthCode(): Promise<AuthCodeResult> {
    this.assertEnabled();
    throw new RegistrarModeError(
      "Namecheap live auth-code request is not enabled in this build (sandbox wiring pending).",
    );
  }
}

// ---- helpers --------------------------------------------------------------

function contactParams(
  prefix: string,
  c: RegistrarContact,
): Record<string, string> {
  const p: Record<string, string> = {
    [`${prefix}FirstName`]: c.firstName,
    [`${prefix}LastName`]: c.lastName,
    [`${prefix}Address1`]: c.address1,
    [`${prefix}City`]: c.city,
    [`${prefix}StateProvince`]: c.stateProvince,
    [`${prefix}PostalCode`]: c.postalCode,
    [`${prefix}Country`]: c.country,
    [`${prefix}Phone`]: c.phone,
    [`${prefix}EmailAddress`]: c.email,
  };
  if (c.organization) p[`${prefix}OrganizationName`] = c.organization;
  if (c.address2) p[`${prefix}Address2`] = c.address2;
  return p;
}

function failure(
  outcome: RegisterResult["outcome"],
  errorCategory: string,
): RegisterResult {
  return { outcome, registered: false, correlation: {}, errorCategory };
}

function sanitizeCategory(code: string | undefined): string {
  return code ? sanitizeText(code) : "transport";
}

function ncHostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "";
  }
}

function mapTransferState(raw: string | undefined): TransferState {
  const s = (raw ?? "").toLowerCase();
  if (s === "true" || s.includes("complete")) return "completed";
  if (s.includes("pending") || s.includes("in progress")) return "pending";
  if (s.includes("approv")) return "approved";
  if (s.includes("reject") || s.includes("declin")) return "rejected";
  if (s.includes("fail") || s === "false" || s.includes("error")) return "failed";
  return "unknown";
}
