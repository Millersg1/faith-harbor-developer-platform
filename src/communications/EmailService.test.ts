import {
  describe,
  expect,
  it,
} from "vitest";

import { EmailRepository } from "./EmailRepository";
import { EmailService } from "./EmailService";
import type { EmailTransport } from "./EmailTransport";
import type {
  EmailMessage,
  EmailResult,
} from "./EmailTypes";

class RecordingTransport
  implements EmailTransport
{
  public last?: EmailMessage;

  constructor(
    private readonly result: EmailResult,
  ) {}

  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    this.last = message;
    return this.result;
  }
}

function createService(
  result: EmailResult = {
    status: "logged",
    provider: "logging",
  },
) {
  const transport =
    new RecordingTransport(result);

  const repository =
    new EmailRepository();

  const service =
    new EmailService(
      transport,
      "Faith Harbor OS <os@faithharbor.example>",
      repository,
    );

  return {
    service,
    transport,
    repository,
  };
}

describe("EmailService", () => {
  it("sends and records an email in the outbox", async () => {
    const {
      service,
      transport,
    } = createService({
      status: "sent",
      provider: "http",
    });

    const email =
      await service.send({
        to: "  client@example.com  ",
        subject: "  Your proposal  ",
        body: "  It is ready.  ",
        clientId: "client-1",
      });

    expect(email.id)
      .toBeDefined();

    expect(email.to)
      .toBe("client@example.com");

    expect(email.subject)
      .toBe("Your proposal");

    expect(email.status)
      .toBe("sent");

    expect(email.clientId)
      .toBe("client-1");

    // The default from address is applied.
    expect(transport.last?.from)
      .toBe(
        "Faith Harbor OS <os@faithharbor.example>",
      );

    expect(service.list())
      .toHaveLength(1);
  });

  it("records a logged email when no provider is configured", async () => {
    const { service } =
      createService({
        status: "logged",
        provider: "logging",
      });

    const email =
      await service.send({
        to: "client@example.com",
        subject: "Hello",
        body: "Test",
      });

    expect(email.status)
      .toBe("logged");

    expect(email.provider)
      .toBe("logging");
  });

  it("honors an explicit from address", async () => {
    const {
      service,
      transport,
    } = createService();

    await service.send({
      to: "client@example.com",
      subject: "Hello",
      body: "Test",
      from: "sales@faithharbor.example",
    });

    expect(transport.last?.from)
      .toBe(
        "sales@faithharbor.example",
      );
  });

  it("rejects a missing recipient", async () => {
    const { service } =
      createService();

    await expect(
      service.send({
        to: "   ",
        subject: "Hello",
        body: "Test",
      }),
    ).rejects.toThrow(
      "An email requires a recipient.",
    );
  });

  it("rejects a missing subject", async () => {
    const { service } =
      createService();

    await expect(
      service.send({
        to: "client@example.com",
        subject: "  ",
        body: "Test",
      }),
    ).rejects.toThrow(
      "An email requires a subject.",
    );
  });

  it("rejects a missing body", async () => {
    const { service } =
      createService();

    await expect(
      service.send({
        to: "client@example.com",
        subject: "Hello",
        body: "   ",
      }),
    ).rejects.toThrow(
      "An email requires a body.",
    );
  });
});
