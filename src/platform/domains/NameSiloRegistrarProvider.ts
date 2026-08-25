/**
 * NameSilo adapter for {@link DomainRegistrarProvider} — the intended LAUNCH
 * registrar for All Elite Cloud. Namecheap remains a separate, intact secondary
 * adapter; nothing here depends on it.
 *
 * NameSilo's API is a simple HTTPS GET returning XML:
 *   {base}/{operation}?version=1&type=xml&key={APIKEY}&<params>
 * A reply carries `<namesilo><reply><code>300</code><detail>success</detail>…`;
 * **code 300 = success**. We reuse the provider-neutral bounded tokenizer
 * (parseNamecheap et al. — it is a generic, safe XML subset parser, not
 * Namecheap-specific) so all Stage 2 parsing-safety properties carry over.
 *
 * Safety properties preserved from Stage 2/3: server-side only; the API key is
 * never returned/thrown/logged (redactSecrets strips the whole query + `key=`);
 * mode + fail-closed flags gate every mutation; the five-way outcome
 * classification is honest and an ambiguous mutation is NEVER auto-retried;
 * money is integer minor units.
 *
 * DOMAIN DEFENDER: NameSilo's Domain Defender adds a security question/answer to
 * sensitive *interactive/web* changes and email notifications. It is NOT an API
 * parameter, and this adapter NEVER requests, stores, transmits, logs, or
 * automates the security answer. Whether Domain Defender additionally gates any
 * specific API mutation (e.g. transfer-out / unlock / nameserver change) is
 * flagged for sandbox (OTE) verification — it cannot be confirmed without
 * credentials, and we do not assume it away.
 */

import {
  classifyTransportError,
  decimalToMinor,
  findAll,
  findFirst,
  NamecheapApiError,
  NamecheapHttpError,
  NamecheapTransportError,
  parseNamecheap,
  sanitizeText,
  type XmlNode,
} from "./namecheapXml";
import type { RegistrarContact } from "./RegistrarContact";
import { createHardenedFetcher } from "./transport/hardenedFetch";
import {
  CapabilityUnsupportedError,
  RegistrarModeError,
  type AccountBalanceResult,
  type AvailabilityResult,
  type CapabilityMatrix,
  type AuthCodeResult,
  type DnsMutationResult,
  type DnsRecord,
  type DnssecInfo,
  type DomainRegistrarProvider,
  type RegistrarMutationResult,
  type DomainStatus,
  type Money,
  type PriceResult,
  type RegisterInput,
  type RegisterResult,
  type RegistrarMode,
  type TransferState,
  type TransferStatusResult,
} from "./RegistrarProvider";

const NAMESILO_SUCCESS = "300";
const CURRENCY = "USD";

export interface NameSiloConfig {
  mode: Extract<RegistrarMode, "namesilo_sandbox" | "namesilo_live">;
  apiKey: string;
  /** e.g. https://www.namesilo.com/api (live) or the NameSilo OTE base (sandbox). */
  baseUrl: string;
  purchasingEnabled: boolean;
  premiumPurchasingEnabled: boolean;
  incomingTransfersEnabled: boolean;
  /**
   * The DOCUMENTED account/pricing currency for this NameSilo reseller account.
   * NameSilo's API returns NO per-response currency code (verified against the
   * API reference at https://www.namesilo.com/api-reference and the live OTE
   * getPrices/getAccountBalance responses — neither carries a currency field),
   * and NameSilo bills resellers and quotes prices in USD. This is therefore an
   * EXPLICIT adapter-level contract, set by configuration — NOT inferred from the
   * OTE sandbox account or any support email. If it is left unset, the balance
   * read FAILS CLOSED to `currency_unknown` rather than assuming USD.
   */
  accountCurrency?: string;
}

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export class NameSiloRegistrarProvider
  implements DomainRegistrarProvider
{
  readonly providerId = "namesilo";
  readonly mode: RegistrarMode;
  private readonly fetcher: Fetcher;

  constructor(
    private readonly config: NameSiloConfig,
    fetcher?: Fetcher,
  ) {
    this.mode = config.mode;
    this.fetcher =
      fetcher ??
      createHardenedFetcher({ allowedHosts: [hostOf(config.baseUrl)] });
  }

  // Capabilities from NameSilo's documented operation set. Evidence "docs";
  // items that cannot be confirmed without the OTE sandbox are "unknown" and
  // explicitly noted — we do NOT assume parity with Namecheap.
  capabilities(): CapabilityMatrix {
    const d = (
      status: CapabilityMatrix[keyof CapabilityMatrix]["status"],
      apiCommand: string,
      note?: string,
    ) => ({ status, apiCommand, evidence: "docs" as const, note });
    return {
      availability: d("supported", "checkRegisterAvailability"),
      pricing: d("supported", "getPrices", "per-year registration/renew/transfer"),
      premiumDetection: d("supported", "checkRegisterAvailability", "premium flag + price attr"),
      registration: d("supported", "registerDomain", "real-time"),
      nonRealtimeRegistration: d("unsupported", "n/a", "NameSilo registration is real-time"),
      renewal: d("supported", "renewDomain"),
      restoration: d("limited", "restoreDomain", "restore operation exists; restore PRICE source (getPrices) to verify in OTE"),
      incomingTransfer: d("supported", "transferDomain"),
      transferStatus: d("supported", "checkTransferStatus"),
      contactManagement: d("supported", "contactAdd/contactUpdate/contactList/contactDomainAssociate"),
      registrantChange: d("limited", "contactDomainAssociate", "change-of-registrant confirmation rules vary by TLD"),
      nameservers: d("supported", "changeNameServers"),
      dnsRecords: d("supported", "dnsListRecords/dnsAddRecord/dnsUpdateRecord/dnsDeleteRecord"),
      lockUnlock: d("supported", "domainLock/domainUnlock"),
      eppAuthCode: d("limited", "retrieveAuthCode", "NameSilo EMAILS the auth code to the registrant; not returned in the API body (good — never logged)"),
      privacy: d("supported", "addPrivacy/removePrivacy + register private=1", "free WHOIS privacy where the TLD allows"),
      dnssec: d("supported", "dnsSecAddRecord/dnsSecListRecords/dnsSecDeleteRecord"),
      accountBalance: d("supported", "getAccountBalance"),
      domainStatus: d("supported", "getDomainInfo"),
      autoRenewControl: d("supported", "addAutoRenewal/removeAutoRenewal", "true API auto-renew toggle (unlike Namecheap)"),
      providerEvents: d("unsupported", "n/a", "no webhooks; Domain Defender sends EMAIL notices only; status is poll-only"),
    };
  }

  private url(operation: string, params: Record<string, string>): string {
    const q = new URLSearchParams({
      version: "1",
      type: "xml",
      key: this.config.apiKey,
      ...params,
    });
    return `${this.config.baseUrl.replace(/\/$/, "")}/${operation}?${q.toString()}`;
  }

  /** Calls NameSilo; returns the <reply> node on success (code 300) or throws. */
  private async call(
    operation: string,
    params: Record<string, string>,
  ): Promise<XmlNode> {
    let res: Awaited<ReturnType<Fetcher>>;
    try {
      res = await this.fetcher(this.url(operation, params));
    } catch (err) {
      throw new NamecheapTransportError((err as { code?: string })?.code);
    }
    const body = await res.text();
    if (!res.ok) throw new NamecheapHttpError(res.status);
    const root = parseNamecheap(body);
    const reply = findFirst(root, "reply");
    if (!reply) throw new NamecheapApiError("NameSilo: no reply element.");
    const code = findFirst(reply, "code")?.text ?? "";
    if (code !== NAMESILO_SUCCESS) {
      throw new NamecheapApiError(
        sanitizeText(findFirst(reply, "detail")?.text ?? "NameSilo error."),
        sanitizeText(code),
      );
    }
    return reply;
  }

  private assertEnabled(): void {
    if ((this.mode as RegistrarMode) === "disabled") {
      throw new RegistrarModeError("Registrar is disabled.");
    }
  }
  private assertPurchasing(): void {
    this.assertEnabled();
    if (this.mode === "namesilo_live" && !this.config.purchasingEnabled) {
      throw new RegistrarModeError(
        "Live purchasing is disabled (DOMAIN_PURCHASING_ENABLED=false).",
      );
    }
  }

  // ---- reads --------------------------------------------------------------
  async checkAvailability(domains: string[]): Promise<AvailabilityResult[]> {
    this.assertEnabled();
    if (domains.length === 0) return [];
    const reply = await this.call("checkRegisterAvailability", {
      domains: domains.join(","),
    });
    const out: AvailabilityResult[] = [];
    for (const avail of findAll(reply, "available")) {
      for (const dom of findAll(avail, "domain")) {
        const isPremium = dom.attrs.get("premium") === "1";
        const price = dom.attrs.get("price");
        out.push({
          domain: sanitizeText(dom.text).toLowerCase(),
          available: true,
          isPremium,
          premiumRegisterPrice:
            isPremium && price
              ? { amountMinor: decimalToMinor(price), currency: CURRENCY }
              : undefined,
        });
      }
    }
    for (const un of findAll(reply, "unavailable")) {
      for (const dom of findAll(un, "domain")) {
        out.push({
          domain: sanitizeText(dom.text).toLowerCase(),
          available: false,
          isPremium: dom.attrs.get("premium") === "1",
        });
      }
    }
    return out;
  }

  private async priceFromTld(
    tld: string,
    child: "registration" | "renew" | "transfer" | "restore",
    years: number,
  ): Promise<PriceResult> {
    this.assertEnabled();
    const reply = await this.call("getPrices", {});
    const t = tld.replace(/^\./, "");
    const node = findFirst(reply, t);
    const per = node ? findFirst(node, child)?.text : undefined;
    if (!per) {
      throw new CapabilityUnsupportedError(
        child === "restore" ? "restoration" : "pricing",
        `NameSilo getPrices has no ${child} price for .${t}.`,
      );
    }
    const perMinor = decimalToMinor(per);
    return {
      tld: t,
      years,
      cost: { amountMinor: perMinor * years, currency: CURRENCY },
      isPremium: false,
    };
  }

  getRegisterPrice(tld: string, years: number) {
    return this.priceFromTld(tld, "registration", years);
  }
  getRenewPrice(tld: string, years: number) {
    return this.priceFromTld(tld, "renew", years);
  }
  getTransferPrice(tld: string, years: number) {
    return this.priceFromTld(tld, "transfer", years);
  }
  getRestorePrice(tld: string) {
    return this.priceFromTld(tld, "restore", 1);
  }

  async getRegistrationStatus(domain: string): Promise<DomainStatus> {
    this.assertEnabled();
    const reply = await this.call("getDomainInfo", { domain });
    const ns = findAll(reply, "nameserver")
      .map((n) => sanitizeText(n.text))
      .filter(Boolean);
    return {
      domain,
      registered: true,
      expiresAt: sanitizeText(findFirst(reply, "expires")?.text ?? "") || undefined,
      locked: (findFirst(reply, "locked")?.text ?? "").toLowerCase() === "yes",
      privacyEnabled: (findFirst(reply, "private")?.text ?? "").toLowerCase() === "yes",
      autoRenew: (findFirst(reply, "auto_renew")?.text ?? "").toLowerCase() === "yes",
      nameservers: ns,
      lifecycleState: sanitizeText(findFirst(reply, "status")?.text ?? "") || undefined,
    };
  }
  getExpiry(domain: string) {
    return this.getRegistrationStatus(domain);
  }

  async getContacts(domain: string): Promise<Record<string, RegistrarContact>> {
    this.assertEnabled();
    await this.call("getDomainInfo", { domain });
    return {}; // full contact mapping is Stage 5
  }
  async getNameservers(domain: string): Promise<string[]> {
    return (await this.getRegistrationStatus(domain)).nameservers ?? [];
  }
  async getRegistrarLock(domain: string): Promise<boolean> {
    return Boolean((await this.getRegistrationStatus(domain)).locked);
  }
  async getAccountBalance(): Promise<AccountBalanceResult> {
    this.assertEnabled();
    // Provider REJECTION (code != 300), TRANSPORT failure, and un-parseable XML
    // are thrown by call(); a well-formed success with an unusable <balance> is a
    // distinct fail-closed `unavailable` result — NEVER a fabricated zero.
    const reply = await this.call("getAccountBalance", {});
    const balances = findAll(reply, "balance");
    if (balances.length === 0) return { status: "unavailable", reason: "missing_balance_element" };
    if (balances.length > 1) return { status: "unavailable", reason: "duplicate_balance_elements" };
    const raw = sanitizeText(balances[0].text);
    if (raw === "") return { status: "unavailable", reason: "empty_balance" };
    if (/^-/.test(raw)) return { status: "unavailable", reason: "negative_balance" };
    // Currency is a documented adapter contract; unset => fail closed.
    const currency = (this.config.accountCurrency ?? "").trim();
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
      domain: input.domain,
      years: String(input.years),
      private: input.enablePrivacy ? "1" : "0",
      auto_renew: input.premiumAcknowledged ? "0" : "0", // set explicitly by lifecycle stage
      ...contactParams(input.contacts.registrant),
    };
    if (input.nameservers?.length) {
      input.nameservers.slice(0, 13).forEach((ns, i) => {
        params[`ns${i + 1}`] = ns;
      });
    }
    let reply: XmlNode;
    try {
      reply = await this.call("registerDomain", params);
    } catch (err) {
      return classifyWriteError(err);
    }
    // Reaching here means code 300 = definitive success (real-time).
    return {
      outcome: "definitive_success",
      registered: true,
      privacyEnabled: input.enablePrivacy,
      correlation: {
        chargedMinor: readMoney(findFirst(reply, "order_amount")?.text),
        currency: CURRENCY,
        orderId: sanitizeText(findFirst(reply, "order_id")?.text ?? "") || undefined,
      },
      providerCorrelationId:
        sanitizeText(findFirst(reply, "order_id")?.text ?? "") || undefined,
    };
  }

  async renew(
    domain: string,
    years: number,
    _idempotencyKey: string,
  ): Promise<RegisterResult> {
    this.assertPurchasing();
    let reply: XmlNode;
    try {
      reply = await this.call("renewDomain", { domain, years: String(years) });
    } catch (err) {
      return classifyWriteError(err);
    }
    return {
      outcome: "definitive_success",
      registered: true,
      correlation: {
        chargedMinor: readMoney(findFirst(reply, "order_amount")?.text),
        currency: CURRENCY,
        orderId: sanitizeText(findFirst(reply, "order_id")?.text ?? "") || undefined,
      },
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
    // `auth` (EPP) is used transiently for this call only; never stored/logged
    // (redactSecrets strips `auth=`).
    const reply = await this.call("transferDomain", { domain, auth: eppCode });
    return {
      domain,
      state: mapTransferState(findFirst(reply, "detail")?.text),
      correlation: {
        orderId: sanitizeText(findFirst(reply, "order_id")?.text ?? "") || undefined,
      },
    };
  }

  async getTransferStatus(domain: string): Promise<TransferStatusResult> {
    this.assertEnabled();
    const reply = await this.call("checkTransferStatus", { domain });
    return {
      domain,
      state: mapTransferState(findFirst(reply, "status")?.text),
      correlation: {},
    };
  }

  // ---- DNS (Stage 8) ------------------------------------------------------
  // NameSilo DNS is documented and applicable (see capabilities():
  // changeNameServers / dnsListRecords / dnsAddRecord / dnsUpdateRecord /
  // dnsDeleteRecord / dnsSec*). Live HTTP wiring is DELIBERATELY DEFERRED until
  // NameSilo OTE (sandbox) credentials exist so it can be proven end-to-end in
  // the sandbox before any real zone is ever touched. Until then these fail
  // closed — a production DNS mutation is impossible through this adapter.
  private dnsDeferred(): never {
    throw new RegistrarModeError(
      "NameSilo live DNS management is not enabled in this build (OTE sandbox wiring pending).",
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

  // ---- outgoing-transfer support (Stage 10) -------------------------------
  // NameSilo supports domainLock/domainUnlock + retrieveAuthCode (which EMAILS
  // the code to the registrant — never in the API body). Live wiring is deferred
  // until OTE proof; fail closed so no production lock/unlock occurs here.
  async setRegistrarLock(): Promise<RegistrarMutationResult> {
    this.assertEnabled();
    throw new RegistrarModeError(
      "NameSilo live registrar lock/unlock is not enabled in this build (OTE wiring pending).",
    );
  }
  async requestAuthCode(): Promise<AuthCodeResult> {
    this.assertEnabled();
    // Even when wired, NameSilo EMAILS the auth code to the registrant and never
    // returns it via API — the platform stores/displays nothing.
    throw new RegistrarModeError(
      "NameSilo live auth-code request is not enabled in this build (OTE wiring pending).",
    );
  }
}

// ---- helpers --------------------------------------------------------------

function contactParams(c: RegistrarContact): Record<string, string> {
  const p: Record<string, string> = {
    fn: c.firstName,
    ln: c.lastName,
    ad: c.address1,
    cy: c.city,
    st: c.stateProvince,
    zp: c.postalCode,
    ct: c.country,
    em: c.email,
    ph: c.phone,
  };
  if (c.organization) p.cp = c.organization;
  if (c.address2) p.ad2 = c.address2;
  return p;
}

function readMoney(s: string | undefined): number | undefined {
  if (!s) return undefined;
  try {
    return decimalToMinor(sanitizeText(s));
  } catch {
    return undefined;
  }
}

function classifyWriteError(err: unknown): RegisterResult {
  if (err instanceof NamecheapTransportError) {
    return fail(classifyTransportError(err), sanitizeText(err.code ?? "transport"));
  }
  if (err instanceof NamecheapApiError) {
    return fail("provider_rejection", err.number ?? "api_error");
  }
  // HTTP / parse / anything else mid-mutation -> ambiguous, never auto-retried.
  return fail("ambiguous_unknown", "unclassified");
}

function fail(
  outcome: RegisterResult["outcome"],
  errorCategory: string,
): RegisterResult {
  return { outcome, registered: false, correlation: {}, errorCategory };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return ""; // misconfig -> hardened fetcher fails closed (host-not-allowed)
  }
}

function mapTransferState(raw: string | undefined): TransferState {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("complete") || s.includes("success")) return "completed";
  if (s.includes("pending") || s.includes("progress") || s.includes("accepted"))
    return "pending";
  if (s.includes("approv")) return "approved";
  if (s.includes("reject") || s.includes("declin")) return "rejected";
  if (s.includes("fail") || s.includes("error") || s.includes("cancel"))
    return "failed";
  return "unknown";
}
