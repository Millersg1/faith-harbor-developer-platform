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
  NAMECHEAP_SANDBOX_API_USER?: string;
  NAMECHEAP_SANDBOX_USERNAME?: string;
  NAMECHEAP_SANDBOX_API_KEY?: string;
  NAMECHEAP_SANDBOX_CLIENT_IP?: string;
  NAMECHEAP_LIVE_API_USER?: string;
  NAMECHEAP_LIVE_USERNAME?: string;
  NAMECHEAP_LIVE_API_KEY?: string;
  NAMECHEAP_LIVE_CLIENT_IP?: string;
}

const SANDBOX_URL = "https://api.sandbox.namecheap.com/xml.response";
const LIVE_URL = "https://api.namecheap.com/xml.response";

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
      nonRealtimeRegistration: u, renewal: u, incomingTransfer: u,
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
  if (mode === "disabled") {
    return new DisconnectedRegistrarProvider();
  }
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
    // Configured mode but missing secrets -> stay disconnected, never half-live.
    return new DisconnectedRegistrarProvider();
  }
  const config: NamecheapConfig = {
    mode,
    apiUser: creds.apiUser,
    apiKey: creds.apiKey,
    userName: creds.userName,
    clientIp: creds.clientIp,
    baseUrl: sandbox ? SANDBOX_URL : LIVE_URL,
    purchasingEnabled: truthy(env.DOMAIN_PURCHASING_ENABLED),
    premiumPurchasingEnabled: truthy(env.DOMAIN_PREMIUM_PURCHASING_ENABLED),
    incomingTransfersEnabled: truthy(env.DOMAIN_INCOMING_TRANSFERS_ENABLED),
  };
  return new NamecheapRegistrarProvider(config, fetcher);
}
