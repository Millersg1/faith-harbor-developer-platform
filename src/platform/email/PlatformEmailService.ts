import { randomUUID } from "node:crypto";

import {
  LoggingEmailTransport,
  type EmailTransport,
} from "../../communications/EmailTransport";
import type { PlatformEmailRecord } from "./PlatformEmail";
import { PlatformEmailRepository } from "./PlatformEmailRepository";

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  from?: string;
  /** Optional branded HTML alternative; the plain `body` is always stored. */
  html?: string;
}

/**
 * Sends email for the acting tenant and records every message in the tenant's
 * outbox. Delivery goes through an injected transport — a real SMTP transport
 * when configured, otherwise a logging transport that records but doesn't
 * deliver (so the platform runs fine with no mail server). Sending is
 * best-effort: a delivery failure is recorded, never thrown, so it can't break
 * the action that triggered it (an invite, a notification, …).
 */
export class PlatformEmailService {
  private readonly fromDefault: string;

  constructor(
    private readonly repository =
      new PlatformEmailRepository(),
    private readonly transport: EmailTransport =
      new LoggingEmailTransport(),
    options: {
      fromDefault?: string;
      connected?: boolean;
    } = {},
  ) {
    this.fromDefault =
      options.fromDefault ||
      "no-reply@allelitecloud.com";
    this.connectedFlag = Boolean(
      options.connected,
    );
  }

  private readonly connectedFlag: boolean;

  /** Whether a real email provider is configured (vs. log-only). */
  connected(): boolean {
    return this.connectedFlag;
  }

  private readonly EMAIL_RE =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async send(
    request: SendEmailRequest,
  ): Promise<PlatformEmailRecord> {
    const to = request.to.trim();

    if (!this.EMAIL_RE.test(to)) {
      throw new Error(
        "Enter a valid recipient email address.",
      );
    }

    const subject =
      request.subject.trim() ||
      "(no subject)";
    const from =
      request.from?.trim() ||
      this.fromDefault;

    let status: PlatformEmailRecord["status"] =
      "failed";
    let provider = "unknown";
    let error: string | undefined;

    try {
      const result =
        await this.transport.send({
          from,
          to,
          subject,
          body: request.body,
          ...(request.html
            ? { html: request.html }
            : {}),
        });

      status = result.status;
      provider = result.provider;
      error = result.error;
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "Email delivery failed.";
    }

    const record: PlatformEmailRecord = {
      id: randomUUID(),
      to,
      subject,
      body: request.body,
      from,
      status,
      provider,
      error,
      organizationId: "",
      createdAt: new Date().toISOString(),
    };

    // Persisting to the tenant outbox is a best-effort secondary copy. It must
    // not turn a transport-confirmed status into a throw (e.g. a platform-level
    // message sent outside any tenant context, where the tenant-scoped outbox
    // has nothing to write to). Callers get the honest transport status either
    // way; the outbox write is attempted and swallowed on failure.
    try {
      return await this.repository.create({
        id: record.id,
        to: record.to,
        subject: record.subject,
        body: record.body,
        from: record.from,
        status: record.status,
        provider: record.provider,
        error: record.error,
        createdAt: record.createdAt,
      });
    } catch {
      return record;
    }
  }

  /**
   * Sends an email, swallowing any error entirely. For notifications that must
   * never break the triggering action (invites, welcome mail, …).
   */
  async sendQuietly(
    request: SendEmailRequest,
  ): Promise<void> {
    try {
      await this.send(request);
    } catch {
      // Best-effort: the caller's action still succeeds.
    }
  }

  async list(): Promise<
    readonly PlatformEmailRecord[]
  > {
    return this.repository.list();
  }
}
