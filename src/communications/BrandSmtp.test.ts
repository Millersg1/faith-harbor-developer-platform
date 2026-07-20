import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildBrandTransports,
  parseBrandSmtp,
} from "./BrandSmtp";
import { EmailService } from "./EmailService";
import type { EmailTransport } from "./EmailTransport";
import type {
  EmailMessage,
  EmailResult,
} from "./EmailTypes";

class RecordingTransport
  implements EmailTransport
{
  public readonly sent: EmailMessage[] =
    [];

  constructor(
    private readonly name: string,
  ) {}

  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    this.sent.push(message);

    return {
      status: "sent",
      provider: this.name,
    };
  }
}

describe("parseBrandSmtp", () => {
  it("returns an empty list for missing or blank input", () => {
    expect(parseBrandSmtp(undefined)).toEqual(
      [],
    );
    expect(parseBrandSmtp("   ")).toEqual(
      [],
    );
  });

  it("parses valid accounts and lowercases the domain", () => {
    const accounts = parseBrandSmtp(
      JSON.stringify([
        {
          domain: "SaaSSurface.com",
          host: "mail.saassurface.com",
          port: 465,
          user: "hello@saassurface.com",
          password: "secret",
          secure: true,
        },
      ]),
    );

    expect(accounts).toHaveLength(1);
    expect(accounts[0].domain).toBe(
      "saassurface.com",
    );
    expect(accounts[0].secure).toBe(true);
  });

  it("accepts an account without a password (shared default used later)", () => {
    const accounts = parseBrandSmtp(
      JSON.stringify([
        {
          domain: "saassurface.com",
          host: "mail.saassurface.com",
          user: "hello@saassurface.com",
          secure: true,
        },
      ]),
    );

    expect(accounts).toHaveLength(1);
    expect(
      accounts[0].password,
    ).toBeUndefined();
  });

  it("skips malformed entries and invalid JSON without throwing", () => {
    expect(
      parseBrandSmtp("not json"),
    ).toEqual([]);

    const accounts = parseBrandSmtp(
      JSON.stringify([
        { domain: "x.com" }, // missing host/user/password
        {
          domain: "ok.com",
          host: "mail.ok.com",
          user: "hello@ok.com",
          password: "pw",
        },
      ]),
    );

    expect(accounts).toHaveLength(1);
    expect(accounts[0].domain).toBe(
      "ok.com",
    );
  });
});

describe("buildBrandTransports password fallback", () => {
  it("uses the shared default password when an account omits its own, and skips when neither exists", () => {
    const configs: string[] = [];

    const map = buildBrandTransports(
      [
        {
          domain: "withdefault.com",
          host: "mail.withdefault.com",
          user: "hello@withdefault.com",
        },
        {
          domain: "nopassword.com",
          host: "mail.nopassword.com",
          user: "hello@nopassword.com",
        },
      ],
      (config) => {
        configs.push(config.password);
        return {
          async send() {
            return {
              status: "sent" as const,
              provider: "smtp",
            };
          },
        };
      },
      "shared-secret",
    );

    // Both accounts omit a password, but a shared default exists, so
    // both are built with it.
    expect(map.has("withdefault.com")).toBe(
      true,
    );
    expect(configs).toEqual([
      "shared-secret",
      "shared-secret",
    ]);
  });

  it("skips a passwordless account when there is no shared default", () => {
    const map = buildBrandTransports(
      [
        {
          domain: "nopassword.com",
          host: "mail.nopassword.com",
          user: "hello@nopassword.com",
        },
      ],
      () => ({
        async send() {
          return {
            status: "sent" as const,
            provider: "smtp",
          };
        },
      }),
    );

    expect(map.size).toBe(0);
  });
});

describe("EmailService per-brand routing", () => {
  it("sends through the brand mailbox matching the from-domain, else the default", async () => {
    const brand = new RecordingTransport(
      "brand-smtp",
    );

    const fallback =
      new RecordingTransport("default");

    const transports =
      buildBrandTransports(
        [
          {
            domain: "saassurface.com",
            host: "mail.saassurface.com",
            user: "hello@saassurface.com",
            password: "pw",
          },
        ],
        () => brand,
      );

    const service = new EmailService(
      fallback,
      "system@faithharbor.test",
      undefined,
      transports,
    );

    await service.send({
      to: "buyer@example.com",
      subject: "Hello",
      body: "Body",
      from: "hello@saassurface.com",
    });

    await service.send({
      to: "buyer@example.com",
      subject: "Hello",
      body: "Body",
      from: "hello@os.faithharborwebhosting.com",
    });

    expect(brand.sent).toHaveLength(1);
    expect(brand.sent[0].from).toBe(
      "hello@saassurface.com",
    );
    expect(fallback.sent).toHaveLength(1);
    expect(fallback.sent[0].from).toBe(
      "hello@os.faithharborwebhosting.com",
    );
  });
});
