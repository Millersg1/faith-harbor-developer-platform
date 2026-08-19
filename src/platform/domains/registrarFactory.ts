/**
 * Builds the active {@link DomainRegistrarProvider} from environment config,
 * failing closed. The default (unset/unknown mode) is a disconnected provider
 * that throws on every operation, so the registrar can never act unless it is
 * deliberately configured. Credentials are read here (names only in code) and
 * never logged.
 */

import {
  NamecheapRegistrarProvider,
  type Fetcher,
  type NamecheapConfig,
} from "./NamecheapRegistrarProvider";
import {
  NameSiloRegistrarProvider,
  type NameSiloConfig,
} from "./NameSiloRegistrarProvider";
import {
  parseRegistrarMode,
  RegistrarModeError,
  type CapabilityMatrix,
  type DomainRegistrarProvider,
  type RegistrarMode,
} from "./RegistrarProvider";

export interface RegistrarEnv {
  DOMAIN_REGISTRAR_MODE?: string;
  DOMAIN_PURCHASING_ENABLED?: string;
  DOMAIN_PREMIUM_PURCHASING_ENABLED?: string;
  DOMAIN_INCOMING_TRANSFERS_ENABLED?: string;
  // NameSilo (launch provider) — sandbox/OTE first.
  NAMESILO_SANDBOX_API_KEY?: string;
  NAMESILO_LIVE_API_KEY?: string;
  // Namecheap (secondary provider).
  NAMECHEAP_SANDBOX_API_USER?: string;
  NAMECHEAP_SANDBOX_USERNAME?: string;
  NAMECHEAP_SANDBOX_API_KEY?: string;
  NAMECHEAP_SANDBOX_CLIENT_IP?: string;
  NAMECHEAP_LIVE_API_USER?: string;
  NAMECHEAP_LIVE_USERNAME?: string;
  NAMECHEAP_LIVE_API_KEY?: string;
  NAMECHEAP_LIVE_CLIENT_IP?: string;
}

const NC_SANDBOX_URL = "https://api.sandbox.namecheap.com/xml.response";
const NC_LIVE_URL = "https://api.namecheap.com/xml.response";
// NameSilo OTE (sandbox) base is issued with sandbox credentials; the live base
// is the public API. The sandbox base is configurable via the adapter if
// NameSilo assigns a different OTE host.
const NS_SANDBOX_URL = "https://ote.namesilo.com/api";
const NS_LIVE_URL = "https://www.namesilo.com/api";

const truthy = (v: string | undefined): boolean =>
  ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());

/** A provider that refuses every operation — the safe default. */
export class DisconnectedRegistrarProvider
  implements DomainRegistrarProvider
{
  readonly providerId = "disconnected";
  readonly mode: RegistrarMode = "disabled";
  /** Reject (never throw synchronously) so the Promise contract holds. */
  private fail(): Promise<never> {
    return Promise.reject(
      new RegistrarModeError(
        "Domain registrar is not configured (DOMAIN_REGISTRAR_MODE unset/disabled).",
      ),
    );
  }
  capabilities(): CapabilityMatrix {
    // Everything "unknown" — nothing is claimed while disabled.
    const u = { status: "unknown" as const, evidence: "none" as const };
    return {
      availability: u, pricing: u, premiumDetection: u, registration: u,
      nonRealtimeRegistration: u, renewal: u, restoration: u,
      incomingTransfer: u,
      transferStatus: u, contactManagement: u, registrantChange: u,
      nameservers: u, dnsRecords: u, lockUnlock: u, eppAuthCode: u,
      privacy: u, dnssec: u, accountBalance: u, domainStatus: u,
      autoRenewControl: u, providerEvents: u,
    };
  }
  checkAvailability() { return this.fail(); }
  getRegisterPrice() { return this.fail(); }
  getRenewPrice() { return this.fail(); }
  getTransferPrice() { return this.fail(); }
  getRestorePrice() { return this.fail(); }
  register() { return this.fail(); }
  getRegistrationStatus() { return this.fail(); }
  renew() { return this.fail(); }
  getContacts() { return this.fail(); }
  getNameservers() { return this.fail(); }
  getRegistrarLock() { return this.fail(); }
  getExpiry() { return this.fail(); }
  getAccountBalance() { return this.fail(); }
  initiateInboundTransfer() { return this.fail(); }
  getTransferStatus() { return this.fail(); }
  setNameservers() { return this.fail(); }
  getDnsRecords() { return this.fail(); }
  applyDnsRecords() { return this.fail(); }
  getDnssec() { return this.fail(); }
}

/**
 * Resolves the provider from env. Returns Disconnected when mode is disabled or
 * required credentials are missing (fail-closed — never guesses live).
 */
export function createRegistrarProvider(
  env: RegistrarEnv,
  fetcher?: Fetcher,
): DomainRegistrarProvider {
  const mode = parseRegistrarMode(env.DOMAIN_REGISTRAR_MODE);
  const flags = {
    purchasingEnabled: truthy(env.DOMAIN_PURCHASING_ENABLED),
    premiumPurchasingEnabled: truthy(env.DOMAIN_PREMIUM_PURCHASING_ENABLED),
    incomingTransfersEnabled: truthy(env.DOMAIN_INCOMING_TRANSFERS_ENABLED),
  };

  // NameSilo (launch provider).
  if (mode === "namesilo_sandbox" || mode === "namesilo_live") {
    const sandbox = mode === "namesilo_sandbox";
    const apiKey = sandbox
      ? env.NAMESILO_SANDBOX_API_KEY
      : env.NAMESILO_LIVE_API_KEY;
    if (!apiKey) {
      return new DisconnectedRegistrarProvider(); // fail closed, never half-live
    }
    const config: NameSiloConfig = {
      mode,
      apiKey,
      baseUrl: sandbox ? NS_SANDBOX_URL : NS_LIVE_URL,
      ...flags,
    };
    return new NameSiloRegistrarProvider(config, fetcher);
  }

  // Namecheap (secondary provider).
  if (mode === "namecheap_sandbox" || mode === "namecheap_live") {
    const sandbox = mode === "namecheap_sandbox";
    const creds = sandbox
      ? {
          apiUser: env.NAMECHEAP_SANDBOX_API_USER,
          userName: env.NAMECHEAP_SANDBOX_USERNAME,
          apiKey: env.NAMECHEAP_SANDBOX_API_KEY,
          clientIp: env.NAMECHEAP_SANDBOX_CLIENT_IP,
        }
      : {
          apiUser: env.NAMECHEAP_LIVE_API_USER,
          userName: env.NAMECHEAP_LIVE_USERNAME,
          apiKey: env.NAMECHEAP_LIVE_API_KEY,
          clientIp: env.NAMECHEAP_LIVE_CLIENT_IP,
        };
    if (!creds.apiUser || !creds.userName || !creds.apiKey || !creds.clientIp) {
      return new DisconnectedRegistrarProvider();
    }
    const config: NamecheapConfig = {
      mode,
      apiUser: creds.apiUser,
      apiKey: creds.apiKey,
      userName: creds.userName,
      clientIp: creds.clientIp,
      baseUrl: sandbox ? NC_SANDBOX_URL : NC_LIVE_URL,
      ...flags,
    };
    return new NamecheapRegistrarProvider(config, fetcher);
  }

  // disabled / unknown -> fail closed.
  return new DisconnectedRegistrarProvider();
}
