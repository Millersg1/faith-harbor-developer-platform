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
