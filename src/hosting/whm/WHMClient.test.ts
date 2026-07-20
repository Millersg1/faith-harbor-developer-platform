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

  it("creates an account via POST without the password in the URL", async () => {
    const captured: {
      url?: string;
      method?: string;
      body?: string;
    } = {};

    const client = new WHMClient(
      config,
      async (url, init) => {
        captured.url = url;
        captured.method = init?.method;
        captured.body = init?.body;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            metadata: { result: 1 },
            data: {
              ip: "203.0.113.20",
              nameserver: [
                "ns1.example.com",
                "ns2.example.com",
              ],
            },
          }),
        };
      },
    );

    const created =
      await client.createAccount({
        username: "graceco",
        domain: "gracechapel.org",
        password: "s3cr3t-pass",
        plan: "Starter",
        contactEmail:
          "pastor@gracechapel.org",
      });

    expect(created).toEqual({
      username: "graceco",
      domain: "gracechapel.org",
      ipAddress: "203.0.113.20",
      nameservers: [
        "ns1.example.com",
        "ns2.example.com",
      ],
    });

    // POST to createacct.
    expect(captured.method).toBe(
      "POST",
    );
    expect(captured.url).toContain(
      "/json-api/createacct",
    );

    // Secrets are in the body, never the URL.
    expect(captured.url).not.toContain(
      "s3cr3t-pass",
    );
    expect(captured.body).toContain(
      "password=s3cr3t-pass",
    );
    expect(captured.body).toContain(
      "username=graceco",
    );
    expect(captured.body).toContain(
      "plan=Starter",
    );
    expect(captured.body).toContain(
      "contactemail=pastor",
    );
  });

  it("throws when account creation is rejected by WHM", async () => {
    const client = new WHMClient(
      config,
      stubFetch(
        {
          metadata: {
            result: 0,
            reason:
              "Username already exists.",
          },
        },
        {},
      ),
    );

    await expect(
      client.createAccount({
        username: "taken",
        domain: "taken.example",
        password: "x",
      }),
    ).rejects.toThrow(
      "Username already exists.",
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
