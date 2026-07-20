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
   * WHM package (plan) name to create the account under.
   */
  plan?: string;

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
 * order. Destructive operations (suspend/terminate) are deliberately
 * NOT exposed here yet — those remain under explicit human authority.
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
