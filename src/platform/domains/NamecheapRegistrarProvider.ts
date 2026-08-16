/**
 * Namecheap adapter for {@link DomainRegistrarProvider}.
 *
 * Server-side only. The API key/user/username/client-IP live in config and are
 * NEVER returned, thrown, or logged — every diagnostic string is passed through
 * {@link redactSecrets} and the full query string is redacted. State-changing
 * calls are mode-guarded (disabled / sandbox / live) and gated by explicit
 * fail-closed feature flags for purchasing, premium purchasing, and incoming
 * transfers. Every write returns an honest {@link RegistrarOutcome}; an
 * ambiguous result is NEVER auto-repeated by this layer.
 */

import type { RegistrarContact } from "./RegistrarContact";
import {
  attr,
  classifyTransportError,
  decimalToMinor,
  elements,
  extractApiError,
  isApiError,
  NamecheapApiError,
  redactSecrets,
  sanitizeText,
} from "./namecheapXml";
import {
  RegistrarModeError,
  type AvailabilityResult,
  type CapabilityMatrix,
  type DomainRegistrarProvider,
  type DomainStatus,
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
  /** Full endpoint, e.g. https://api.sandbox.namecheap.com/xml.response */
  baseUrl: string;
  /** Fail-closed: live registration/renewal purchases require this true. */
  purchasingEnabled: boolean;
  /** Separate fail-closed flag: premium purchases require this true (default false). */
  premiumPurchasingEnabled: boolean;
  /** Separate fail-closed flag: incoming transfers require this true (default false). */
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
      fetcher ?? ((url) => fetch(url) as ReturnType<Fetcher>);
  }

  // ---- capability matrix (tied to official API commands) -----------------
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
        "EPP retrieval flow is owner-only + reauth; never logged",
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
        "Namecheap domain API has no reliable tenant auto-renew toggle; our renewal worker must call domains.renew explicitly",
      ),
      providerEvents: docs(
        "unsupported",
        "n/a",
        "Namecheap has no webhooks; status is poll-only",
      ),
    };
  }

  // ---- URL + transport ----------------------------------------------------
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

  /** Raw call; returns the body or throws a redacted error. */
  private async rawCall(
    command: string,
    params: Record<string, string>,
  ): Promise<string> {
    let res: Awaited<ReturnType<Fetcher>>;
    try {
      res = await this.fetcher(this.url(command, params));
    } catch (err) {
      // Re-throw WITHOUT the URL; preserve code for classification.
      const e = new Error(
        redactSecrets(`Namecheap transport error (${command}).`),
      ) as Error & { code?: string; transport: true };
      e.code = (err as { code?: string })?.code;
      (e as { transport: boolean }).transport = true;
      throw e;
    }
    const body = await res.text();
    if (!res.ok) {
      throw new NamecheapApiError(
        redactSecrets(`Namecheap HTTP ${res.status} (${command}).`),
      );
    }
    if (isApiError(body)) {
      throw extractApiError(body);
    }
    return body;
  }

  private assertEnabled(): void {
    if (this.mode === ("disabled" as RegistrarMode)) {
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
  async checkAvailability(
    domains: string[],
  ): Promise<AvailabilityResult[]> {
    this.assertEnabled();
    if (domains.length === 0) return [];
    const body = await this.rawCall("namecheap.domains.check", {
      DomainList: domains.join(","),
    });
    return elements(body, "DomainCheckResult").map((a) => {
      const domain = (attr(a, "Domain") ?? "").toLowerCase();
      const isPremium = attr(a, "IsPremiumName") === "true";
      const premReg = attr(a, "PremiumRegistrationPrice");
      const premRenew = attr(a, "PremiumRenewalPrice");
      return {
        domain,
        available: attr(a, "Available") === "true",
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
    const body = await this.rawCall("namecheap.users.getPricing", {
      ProductType: "DOMAIN",
      ProductCategory: category,
      ActionName: category,
      ProductName: tld.replace(/^\./, ""),
    });
    for (const a of elements(body, "Price")) {
      if (
        attr(a, "Duration") === String(years) &&
        (attr(a, "DurationType") ?? "YEAR").toUpperCase() === "YEAR"
      ) {
        const your = attr(a, "YourPrice") ?? attr(a, "Price");
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

  async getRegistrationStatus(domain: string): Promise<DomainStatus> {
    this.assertEnabled();
    const body = await this.rawCall("namecheap.domains.getInfo", {
      DomainName: domain,
    });
    const info = elements(body, "DomainGetInfoResult")[0] ?? "";
    const wg = elements(body, "Whoisguard")[0];
    const ns = elements(body, "Nameserver").map((_a, i) =>
      nthNameserver(body, i),
    );
    return {
      domain,
      registered: (attr(info, "Status") ?? "").toLowerCase() === "ok",
      expiresAt: firstTagText(body, "ExpiredDate"),
      privacyEnabled: wg ? attr(wg, "Enabled") === "True" : undefined,
      nameservers: ns.filter(Boolean) as string[],
      lifecycleState: attr(info, "Status"),
    };
  }

  getExpiry(domain: string) {
    return this.getRegistrationStatus(domain);
  }

  async getContacts(
    domain: string,
  ): Promise<Record<string, RegistrarContact>> {
    this.assertEnabled();
    // Retrieval is supported; full mapping is Stage 5. Returns raw-free shell.
    await this.rawCall("namecheap.domains.getContacts", { DomainName: domain });
    return {};
  }

  async getNameservers(domain: string): Promise<string[]> {
    const s = await this.getRegistrationStatus(domain);
    return s.nameservers ?? [];
  }

  async getRegistrarLock(domain: string): Promise<boolean> {
    this.assertEnabled();
    const body = await this.rawCall("namecheap.domains.getRegistrarLock", {
      DomainName: domain,
    });
    const r = elements(body, "DomainGetRegistrarLockResult")[0] ?? "";
    return (attr(r, "RegistrarLockStatus") ?? "").toLowerCase() === "true";
  }

  async getAccountBalance(): Promise<Money> {
    this.assertEnabled();
    const body = await this.rawCall("namecheap.users.getBalances", {});
    const r = elements(body, "UserGetBalancesResult")[0] ?? "";
    const bal = attr(r, "AvailableBalance");
    return {
      amountMinor: bal ? decimalToMinor(bal) : 0,
      currency: attr(r, "Currency") ?? CURRENCY,
    };
  }

  // ---- writes (mode + flag guarded, honest outcomes) ----------------------
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
    if (input.nameservers?.length) {
      params.Nameservers = input.nameservers.join(",");
    }
    if (input.enablePrivacy) {
      params.AddFreeWhoisguard = "yes";
      params.WGEnabled = "yes";
    }
    if (input.premiumAcknowledged && input.acceptedPremiumMinor != null) {
      params.IsPremiumDomain = "true";
      params.PremiumPrice = (input.acceptedPremiumMinor / 100).toFixed(2);
    }

    let body: string;
    try {
      body = await this.rawCall("namecheap.domains.create", params);
    } catch (err) {
      if (isTransport(err)) {
        return failure(classifyTransportError(err), sanitizeCategory(err));
      }
      // A parsed API error is a definitive provider rejection.
      if (err instanceof NamecheapApiError) {
        return failure("provider_rejection", err.number ?? "api_error");
      }
      // Anything else mid-mutation is ambiguous — never auto-repeat.
      return failure("ambiguous_unknown", "unclassified");
    }

    const r = elements(body, "DomainCreateResult")[0];
    if (!r) {
      // Got a 200 but couldn't parse the result -> ambiguous, reconcile later.
      return failure("ambiguous_unknown", "unparsable_create_result");
    }
    const registered = attr(r, "Registered") === "true";
    const nonRealtime = attr(r, "NonRealTimeDomain") === "true";
    const correlation = {
      chargedMinor: attr(r, "ChargedAmount")
        ? decimalToMinor(attr(r, "ChargedAmount")!)
        : undefined,
      currency: CURRENCY,
      domainId: attr(r, "DomainID"),
      orderId: attr(r, "OrderID"),
      transactionId: attr(r, "TransactionID"),
    };
    if (registered && !nonRealtime) {
      return {
        outcome: "definitive_success",
        registered: true,
        privacyEnabled:
          attr(r, "WhoisguardEnable") === "true" ? true : input.enablePrivacy,
        correlation,
        providerCorrelationId: correlation.orderId,
      };
    }
    if (nonRealtime) {
      // Not real-time: outcome is genuinely unknown until reconciled.
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
    let body: string;
    try {
      body = await this.rawCall("namecheap.domains.renew", {
        DomainName: domain,
        Years: String(years),
      });
    } catch (err) {
      if (isTransport(err)) {
        return failure(classifyTransportError(err), sanitizeCategory(err));
      }
      if (err instanceof NamecheapApiError) {
        return failure("provider_rejection", err.number ?? "api_error");
      }
      return failure("ambiguous_unknown", "unclassified");
    }
    const r = elements(body, "DomainRenewResult")[0] ?? "";
    const ok = attr(r, "Renew") === "true";
    return {
      outcome: ok ? "definitive_success" : "definitive_failure",
      registered: ok,
      correlation: {
        chargedMinor: attr(r, "ChargedAmount")
          ? decimalToMinor(attr(r, "ChargedAmount")!)
          : undefined,
        currency: CURRENCY,
        domainId: attr(r, "DomainID"),
        orderId: attr(r, "OrderID"),
        transactionId: attr(r, "TransactionID"),
      },
      errorCategory: ok ? undefined : "renew_false",
    };
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
    // The raw EPP code is used transiently for this call only and never stored
    // or logged; it exists solely as this parameter's value here.
    const body = await this.rawCall("namecheap.domains.transfer.create", {
      DomainName: domain,
      Years: "1",
      EPPCode: eppCode,
    });
    const r = elements(body, "DomainTransferCreateResult")[0] ?? "";
    return {
      domain,
      state: mapTransferState(attr(r, "TransferStatus") ?? attr(r, "Transfer")),
      correlation: {
        orderId: attr(r, "OrderID"),
        transactionId: attr(r, "TransactionID"),
        domainId: attr(r, "TransferID"),
      },
    };
  }

  async getTransferStatus(domain: string): Promise<TransferStatusResult> {
    this.assertEnabled();
    const body = await this.rawCall("namecheap.domains.transfer.getStatus", {
      DomainName: domain,
    });
    const r = elements(body, "DomainTransferGetStatusResult")[0] ?? "";
    return {
      domain,
      state: mapTransferState(attr(r, "Status")),
      correlation: { domainId: attr(r, "TransferID") },
    };
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

function isTransport(err: unknown): boolean {
  return Boolean((err as { transport?: boolean } | undefined)?.transport);
}

function sanitizeCategory(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  return code ? sanitizeText(code) : "transport";
}

function mapTransferState(raw: string | undefined): TransferState {
  const s = (raw ?? "").toLowerCase();
  if (s === "true" || s.includes("complete")) return "completed";
  if (s.includes("pending") || s.includes("in progress")) return "pending";
  if (s.includes("approv")) return "approved";
  if (s.includes("reject") || s.includes("declin")) return "rejected";
  if (s.includes("fail") || s === "false" || s.includes("error"))
    return "failed";
  return "unknown";
}

function firstTagText(body: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([^<]{0,64})</${tag}>`, "i").exec(body);
  return m ? sanitizeText(m[1]) : undefined;
}

function nthNameserver(body: string, i: number): string | undefined {
  const all = [
    ...body.matchAll(/<Nameserver>([^<]{0,255})<\/Nameserver>/gi),
  ];
  return all[i]?.[1] ? sanitizeText(all[i][1]) : undefined;
}
