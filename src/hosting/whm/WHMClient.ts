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
  },
) => Promise<WHMFetchResponse>;

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
 * Read-only client for the WHM JSON API.
 *
 * This client intentionally exposes only observation methods. It
 * never creates, suspends, or terminates accounts. Destructive
 * operations must remain under human authority.
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
   */
  private async call(
    functionName: string,
  ): Promise<WHMEnvelope> {
    const scheme =
      this.config.useSsl
        ? "https"
        : "http";

    const url =
      `${scheme}://${this.config.host}:${this.config.port}` +
      `/json-api/${functionName}?api.version=1`;

    const response =
      await this.fetchFn(url, {
        method: "GET",
        headers: {
          Authorization:
            `whm ${this.config.user}:${this.config.apiToken}`,
        },
      });

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
