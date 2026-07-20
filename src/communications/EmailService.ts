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

    /**
     * Optional per-brand transports keyed by the lowercased domain of
     * the "from" address (for example "saassurface.com"). When a
     * message's from-address matches, it is sent authenticated through
     * that brand's own mailbox so SPF/DKIM align for the domain.
     * Otherwise the default transport is used.
     */
    private readonly brandTransports: ReadonlyMap<
      string,
      EmailTransport
    > = new Map(),
  ) {}

  /**
   * Chooses the transport for a message: the brand mailbox matching the
   * from-address domain when one is configured, else the default.
   */
  private resolveTransport(
    from: string,
  ): EmailTransport {
    const at = from.lastIndexOf("@");

    if (at >= 0) {
      const domain = from
        .slice(at + 1)
        .trim()
        .toLowerCase();

      const branded =
        this.brandTransports.get(domain);

      if (branded) {
        return branded;
      }
    }

    return this.transport;
  }

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
      await this.resolveTransport(
        from,
      ).send({
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
