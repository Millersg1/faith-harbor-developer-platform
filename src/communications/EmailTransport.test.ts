import {
  describe,
  expect,
  it,
} from "vitest";

import {
  HttpEmailTransport,
  LoggingEmailTransport,
  type EmailFetch,
} from "./EmailTransport";

const message = {
  from: "os@faithharbor.example",
  to: "client@example.com",
  subject: "Hello",
  body: "Your proposal is ready.",
};

describe("LoggingEmailTransport", () => {
  it("records without sending", async () => {
    const transport =
      new LoggingEmailTransport();

    const result =
      await transport.send(message);

    expect(result.status).toBe(
      "logged",
    );

    expect(result.provider).toBe(
      "logging",
    );
  });
});

describe("HttpEmailTransport", () => {
  it("sends via the HTTP API with auth", async () => {
    const calls: {
      url?: string;
      headers?: Record<
        string,
        string
      >;
      body?: string;
    } = {};

    const fetchFn: EmailFetch =
      async (url, init) => {
        calls.url = url;
        calls.headers = init.headers;
        calls.body = init.body;

        return {
          ok: true,
          status: 200,
          text: async () => "{}",
        };
      };

    const transport =
      new HttpEmailTransport(
        {
          apiUrl:
            "https://email.example/api",
          apiKey: "secret-key",
        },
        fetchFn,
      );

    const result =
      await transport.send(message);

    expect(result.status).toBe(
      "sent",
    );

    expect(calls.url).toBe(
      "https://email.example/api",
    );

    expect(
      calls.headers?.Authorization,
    ).toBe("Bearer secret-key");

    expect(calls.body).toContain(
      "client@example.com",
    );
  });

  it("reports failure on a non-ok response", async () => {
    const fetchFn: EmailFetch =
      async () => ({
        ok: false,
        status: 500,
        text: async () => "error",
      });

    const transport =
      new HttpEmailTransport(
        {
          apiUrl:
            "https://email.example/api",
          apiKey: "secret-key",
        },
        fetchFn,
      );

    const result =
      await transport.send(message);

    expect(result.status).toBe(
      "failed",
    );

    expect(result.error).toContain(
      "500",
    );
  });

  it("reports failure when fetch throws", async () => {
    const fetchFn: EmailFetch =
      async () => {
        throw new Error(
          "network down",
        );
      };

    const transport =
      new HttpEmailTransport(
        {
          apiUrl:
            "https://email.example/api",
          apiKey: "secret-key",
        },
        fetchFn,
      );

    const result =
      await transport.send(message);

    expect(result.status).toBe(
      "failed",
    );

    expect(result.error).toBe(
      "network down",
    );
  });
});
