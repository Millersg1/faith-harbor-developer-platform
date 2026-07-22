import type { WHMConfiguration } from "./WHMConfiguration";

/**
 * A single hosting account as reported live by WHM.
 */
export interface WHMLiveAccount {
  user: string;
  domain: string;
  plan?: string;
  ipAddress?: string;
  suspended: boolean;
  diskUsedMb?: number;
  diskLimitMb?: number;
}

/**
 * Server load as reported live by WHM.
 */
export interface WHMServerStatus {
  loadOne: number;
  loadFive: number;
  loadFifteen: number;
}

/**
 * Minimal response contract so the client can be tested with a
 * stub in place of the global fetch implementation.
 */
export interface WHMFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type WHMFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<WHMFetchResponse>;

/**
 * Explicit per-account resource limits, used when no WHM package is
 * defined. A value of -1 means unlimited. Derived from the hosting
 * plan's specs, so the plan catalog is the single source of truth.
 */
export interface WHMAccountLimits {
  /**
   * Disk quota in megabytes.
   */
  quotaMb?: number;

  /**
   * Monthly bandwidth in megabytes.
   */
  bandwidthMb?: number;

  maxAddonDomains?: number;

  maxEmailAccounts?: number;

  maxDatabases?: number;
}

/**
 * Everything needed to provision one cPanel account through WHM.
 */
export interface WHMCreateAccountRequest {
  /**
   * cPanel username (WHM constraints: <= 16 chars, alphanumeric,
   * lowercase, starts with a letter).
   */
  username: string;

  /**
   * Primary domain for the account.
   */
  domain: string;

  /**
   * Initial cPanel password.
   */
  password: string;

  /**
   * WHM package (plan) name to create the account under. Optional; when
   * omitted, explicit `limits` are applied over WHM's default package.
   */
  plan?: string;

  /**
   * Explicit resource limits (used when not provisioning from a named
   * WHM package).
   */
  limits?: WHMAccountLimits;

  /**
   * Contact email stored on the account (for cPanel notices).
   */
  contactEmail?: string;
}

/**
 * The result of a successful account creation.
 */
export interface WHMCreatedAccount {
  username: string;
  domain: string;
  ipAddress?: string;
  nameservers?: string[];
}

interface WHMEnvelope {
  metadata?: {
    result?: number;
    reason?: string;
  };
  data?: unknown;
}

function toNumber(
  value: unknown,
): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

/**
 * Client for the WHM JSON API.
 *
 * Observation methods (listAccounts, serverStatus) are always safe.
 * Account creation (createAccount) provisions real cPanel accounts and
 * is used only by the provisioning flow, which is gated behind a paid
 * order. Suspend/unsuspend are exposed for automated dunning: both are
 * fully reversible (a suspended account keeps all its data and is
 * restored the moment payment arrives). Account TERMINATION (removeacct)
 * is deliberately NOT exposed — deleting an account is irreversible and
 * remains under explicit human authority.
 */
export class WHMClient {
  constructor(
    private readonly config: WHMConfiguration,
    private readonly fetchFn: WHMFetch =
      globalThis.fetch as unknown as WHMFetch,
  ) {}

  /**
   * Returns every hosting account reported by WHM.
   */
  async listAccounts():
  Promise<WHMLiveAccount[]> {
    const envelope =
      await this.call("listaccts");

    const data =
      envelope.data as
        | { acct?: unknown[] }
        | undefined;

    const accounts =
      Array.isArray(data?.acct)
        ? data.acct
        : [];

    return accounts.map((entry) => {
      const record =
        entry as Record<string, unknown>;

      return {
        user: String(
          record.user ?? "",
        ),

        domain: String(
          record.domain ?? "",
        ),

        plan:
          record.plan
            ? String(record.plan)
            : undefined,

        ipAddress:
          record.ip
            ? String(record.ip)
            : undefined,

        suspended:
          record.suspended === 1 ||
          record.suspended === "1" ||
          record.suspended === true,

        diskUsedMb: toNumber(
          record.diskused,
        ),

        diskLimitMb: toNumber(
          record.disklimit,
        ),
      };
    });
  }

  /**
   * Provisions a new cPanel account through WHM (createacct).
   *
   * Sent as a POST so the password is never placed in a URL (which
   * servers commonly log). Throws when WHM reports failure (for
   * example a duplicate username or domain).
   */
  async createAccount(
    request: WHMCreateAccountRequest,
  ): Promise<WHMCreatedAccount> {
    const params: Record<string, string> =
      {
        username: request.username,
        domain: request.domain,
        password: request.password,
      };

    if (request.plan) {
      params.plan = request.plan;
    }

    if (request.contactEmail) {
      params.contactemail =
        request.contactEmail;
    }

    // Explicit resource limits (WHM uses -1/"unlimited"). These map the
    // plan's specs onto the account when no named package is used.
    const limit = (
      value: number,
    ): string =>
      value < 0
        ? "unlimited"
        : String(value);

    const limits = request.limits;

    if (limits) {
      if (
        limits.quotaMb !== undefined
      ) {
        params.quota = limit(
          limits.quotaMb,
        );
      }

      if (
        limits.bandwidthMb !== undefined
      ) {
        params.bwlimit = limit(
          limits.bandwidthMb,
        );
      }

      if (
        limits.maxAddonDomains !==
        undefined
      ) {
        params.maxaddon = limit(
          limits.maxAddonDomains,
        );
      }

      if (
        limits.maxEmailAccounts !==
        undefined
      ) {
        params.maxpop = limit(
          limits.maxEmailAccounts,
        );
      }

      if (
        limits.maxDatabases !==
        undefined
      ) {
        params.maxsql = limit(
          limits.maxDatabases,
        );
      }
    }

    const envelope = await this.call(
      "createacct",
      params,
      "POST",
    );

    const data =
      (envelope.data ??
        {}) as Record<string, unknown>;

    const result: WHMCreatedAccount = {
      username: request.username,
      domain: request.domain,
    };

    if (data.ip) {
      result.ipAddress = String(
        data.ip,
      );
    }

    if (Array.isArray(data.nameserver)) {
      result.nameservers =
        data.nameserver.map((ns) =>
          String(ns),
        );
    }

    return result;
  }

  /**
   * Creates a one-time cPanel login session for an account and returns
   * the sign-in URL (create_user_session). This powers the customer's
   * one-click "Open cPanel" button — no password needed.
   */
  async createUserSession(
    user: string,
    service = "cpaneld",
  ): Promise<string> {
    const envelope = await this.call(
      "create_user_session",
      { user, service },
      "POST",
    );

    const data =
      (envelope.data ??
        {}) as Record<string, unknown>;

    if (!data.url) {
      throw new Error(
        "WHM did not return a cPanel login URL.",
      );
    }

    return String(data.url);
  }

  /**
   * Suspends a cPanel account (suspendacct). The account's data is
   * preserved and its website goes offline until unsuspended. Used by
   * automated dunning when a renewal invoice goes unpaid past the grace
   * period. Fully reversible via unsuspendAccount. Sent as POST.
   */
  async suspendAccount(
    user: string,
    reason?: string,
  ): Promise<void> {
    const params: Record<string, string> =
      { user };

    if (reason) {
      params.reason = reason;
    }

    await this.call(
      "suspendacct",
      params,
      "POST",
    );
  }

  /**
   * Restores a suspended cPanel account (unsuspendacct), bringing the
   * website back online. Used to automatically reactivate an account the
   * moment a past-due renewal is paid. Sent as POST.
   */
  async unsuspendAccount(
    user: string,
  ): Promise<void> {
    await this.call(
      "unsuspendacct",
      { user },
      "POST",
    );
  }

  /**
   * Returns the names of the WHM packages defined on the server.
   */
  async listPackages():
  Promise<string[]> {
    const envelope =
      await this.call("listpkgs");

    const data =
      envelope.data as
        | { pkg?: unknown[] }
        | undefined;

    const packages =
      Array.isArray(data?.pkg)
        ? data.pkg
        : [];

    return packages
      .map((entry) => {
        const record =
          entry as Record<
            string,
            unknown
          >;

        return record.name
          ? String(record.name)
          : "";
      })
      .filter(Boolean);
  }

  /**
   * Creates a WHM package (addpkg) from a plan's resource limits, so
   * accounts can be provisioned against it. Idempotent at the caller:
   * check listPackages first. -1 maps to "unlimited".
   */
  async createPackage(request: {
    name: string;
    quotaMb?: number;
    bandwidthMb?: number;
    maxAddonDomains?: number;
    maxEmailAccounts?: number;
    maxDatabases?: number;
  }): Promise<void> {
    const limit = (
      value: number,
    ): string =>
      value < 0
        ? "unlimited"
        : String(value);

    const params: Record<string, string> =
      { name: request.name };

    if (
      request.quotaMb !== undefined
    ) {
      params.quota = limit(
        request.quotaMb,
      );
    }

    if (
      request.bandwidthMb !== undefined
    ) {
      params.bwlimit = limit(
        request.bandwidthMb,
      );
    }

    if (
      request.maxAddonDomains !==
      undefined
    ) {
      params.maxaddon = limit(
        request.maxAddonDomains,
      );
    }

    if (
      request.maxEmailAccounts !==
      undefined
    ) {
      params.maxpop = limit(
        request.maxEmailAccounts,
      );
    }

    if (
      request.maxDatabases !== undefined
    ) {
      params.maxsql = limit(
        request.maxDatabases,
      );
    }

    await this.call(
      "addpkg",
      params,
      "POST",
    );
  }

  /**
   * Returns the current server load average from WHM.
   */
  async serverStatus():
  Promise<WHMServerStatus> {
    const envelope =
      await this.call(
        "systemloadavg",
      );

    const data =
      (envelope.data ??
        {}) as Record<string, unknown>;

    return {
      loadOne:
        toNumber(data.one) ?? 0,

      loadFive:
        toNumber(data.five) ?? 0,

      loadFifteen:
        toNumber(data.fifteen) ?? 0,
    };
  }

  /**
   * Calls a WHM JSON API function and validates the envelope.
   *
   * GET requests carry parameters in the query string; POST requests
   * (used for writes such as account creation) carry them in a
   * form-encoded body so secrets never appear in a URL.
   */
  private async call(
    functionName: string,
    params: Record<string, string> = {},
    method: "GET" | "POST" = "GET",
  ): Promise<WHMEnvelope> {
    const scheme =
      this.config.useSsl
        ? "https"
        : "http";

    const query = new URLSearchParams({
      "api.version": "1",
      ...params,
    });

    const base =
      `${scheme}://${this.config.host}:${this.config.port}` +
      `/json-api/${functionName}`;

    const headers: Record<string, string> =
      {
        Authorization:
          `whm ${this.config.user}:${this.config.apiToken}`,
      };

    const init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    } = { method, headers };

    let url = base;

    if (method === "POST") {
      headers["Content-Type"] =
        "application/x-www-form-urlencoded";
      init.body = query.toString();
    } else {
      url = `${base}?${query.toString()}`;
    }

    const response =
      await this.fetchFn(url, init);

    if (!response.ok) {
      throw new Error(
        `WHM request failed with status ${response.status}.`,
      );
    }

    const envelope =
      (await response.json()) as WHMEnvelope;

    if (
      envelope.metadata &&
      envelope.metadata.result === 0
    ) {
      throw new Error(
        envelope.metadata.reason ??
          "WHM reported a failed request.",
      );
    }

    return envelope;
  }
}
