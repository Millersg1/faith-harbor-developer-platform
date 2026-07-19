import { randomUUID } from "node:crypto";

import { EmailRepository } from "./EmailRepository";
import type { EmailTransport } from "./EmailTransport";
import type {
  EmailRecord,
  EmailSendRequest,
} from "./EmailTypes";

/**
 * Sends emails through a configured transport and records every
 * message in a persistent outbox.
 *
 * When no delivery provider is configured the transport records
 * messages without sending them, so automations and manual sends
 * never fail silently and nothing is lost.
 */
export class EmailService {
  constructor(
    private readonly transport: EmailTransport,
    private readonly defaultFrom: string,
    private readonly repository =
      new EmailRepository(),
  ) {}

  /**
   * Sends (or logs) an email and records it in the outbox.
   */
  async send(
    request: EmailSendRequest,
  ): Promise<EmailRecord> {
    const to = request.to.trim();

    const subject =
      request.subject.trim();

    const body = request.body.trim();

    if (!to) {
      throw new Error(
        "An email requires a recipient.",
      );
    }

    if (!subject) {
      throw new Error(
        "An email requires a subject.",
      );
    }

    if (!body) {
      throw new Error(
        "An email requires a body.",
      );
    }

    const from =
      request.from?.trim() ||
      this.defaultFrom;

    const result =
      await this.transport.send({
        from,
        to,
        subject,
        body,
      });

    const record: EmailRecord = {
      id: randomUUID(),
      from,
      to,
      subject,
      body,
      status: result.status,
      provider: result.provider,
      error: result.error,
      clientId:
        request.clientId,
      createdAt:
        new Date().toISOString(),
    };

    return this.repository.create(
      record,
    );
  }

  /**
   * Returns the outbox, newest first.
   */
  list(): readonly EmailRecord[] {
    return this.repository.list();
  }
}
