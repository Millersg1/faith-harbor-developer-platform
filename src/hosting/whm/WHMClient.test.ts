import {
  describe,
  expect,
  it,
} from "vitest";

import type { WHMConfiguration } from "./WHMConfiguration";
import {
  WHMClient,
  type WHMFetch,
} from "./WHMClient";

const config: WHMConfiguration = {
  host: "server.example.com",
  apiToken: "secret-token",
  user: "root",
  port: 2087,
  useSsl: true,
};

function stubFetch(
  payload: unknown,
  calls: {
    url?: string;
    headers?: Record<string, string>;
  },
): WHMFetch {
  return async (url, init) => {
    calls.url = url;
    calls.headers = init?.headers;

    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  };
}

describe("WHMClient", () => {
  it("lists accounts from WHM", async () => {
    const calls: {
      url?: string;
      headers?: Record<
        string,
        string
      >;
    } = {};

    const client = new WHMClient(
      config,
      stubFetch(
        {
          metadata: { result: 1 },
          data: {
            acct: [
              {
                user: "faithharbor",
                domain:
                  "faithharbor.org",
                plan: "Business",
                ip: "203.0.113.10",
                suspended: 0,
                diskused: 512,
                disklimit: 5120,
              },
              {
                user: "suspended1",
                domain:
                  "suspended.example",
                suspended: 1,
              },
            ],
          },
        },
        calls,
      ),
    );

    const accounts =
      await client.listAccounts();

    expect(accounts).toHaveLength(2);

    expect(accounts[0]).toEqual({
      user: "faithharbor",
      domain: "faithharbor.org",
      plan: "Business",
      ipAddress: "203.0.113.10",
      suspended: false,
      diskUsedMb: 512,
      diskLimitMb: 5120,
    });

    expect(accounts[1]?.suspended)
      .toBe(true);

    // Uses the WHM JSON API endpoint over HTTPS.
    expect(calls.url).toContain(
      "https://server.example.com:2087/json-api/listaccts",
    );

    // Sends the WHM token authorization header.
    expect(
      calls.headers?.Authorization,
    ).toBe(
      "whm root:secret-token",
    );
  });

  it("reads the server load average", async () => {
    const calls: {
      url?: string;
    } = {};

    const client = new WHMClient(
      config,
      stubFetch(
        {
          metadata: { result: 1 },
          data: {
            one: "0.15",
            five: "0.22",
            fifteen: "0.30",
          },
        },
        calls,
      ),
    );

    const status =
      await client.serverStatus();

    expect(status).toEqual({
      loadOne: 0.15,
      loadFive: 0.22,
      loadFifteen: 0.3,
    });

    expect(calls.url).toContain(
      "systemloadavg",
    );
  });

  it("throws when WHM reports a failed result", async () => {
    const client = new WHMClient(
      config,
      stubFetch(
        {
          metadata: {
            result: 0,
            reason:
              "Access denied.",
          },
        },
        {},
      ),
    );

    await expect(
      client.listAccounts(),
    ).rejects.toThrow(
      "Access denied.",
    );
  });

  it("throws when the HTTP request fails", async () => {
    const failingFetch: WHMFetch =
      async () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

    const client = new WHMClient(
      config,
      failingFetch,
    );

    await expect(
      client.serverStatus(),
    ).rejects.toThrow(
      "WHM request failed with status 401.",
    );
  });
});
