/**
 * The outcome of attempting to deliver an email.
 *
 * sent
 *   Handed to an external email provider for delivery.
 *
 * logged
 *   Recorded only. No provider is configured, so the message was
 *   not actually sent. This is the safe default.
 *
 * failed
 *   A provider was configured but delivery failed.
 */
export type EmailStatus =
  | "sent"
  | "logged"
  | "failed";

/**
 * An email ready to be handed to a transport.
 */
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  body: string;
  /**
   * Optional HTML alternative. When present, transports that support it send a
   * multipart message (HTML + the plain `body` as fallback); the plain body is
   * always kept so non-HTML clients and the outbox record stay readable.
   */
  html?: string;
  /** Optional Reply-To header (e.g. a tenant's marketing reply address). */
  replyTo?: string;
  /** Optional caller-supplied Message-ID value (without angle brackets). */
  messageId?: string;
  /**
   * Optional extra headers (e.g. List-Unsubscribe). Header names + values are
   * CR/LF-validated by the transport; an unsafe value is refused, never sent.
   */
  headers?: Record<string, string>;
}

/**
 * The result returned by a transport.
 */
export interface EmailResult {
  status: EmailStatus;
  provider: string;
  error?: string;
}

/**
 * A stored record of an email in the outbox.
 */
export interface EmailRecord {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  status: EmailStatus;
  provider: string;
  error?: string;

  /**
   * Client this email relates to, if any.
   */
  clientId?: string;

  createdAt: string;
}

/**
 * A request to send an email.
 */
export interface EmailSendRequest {
  to: string;
  subject: string;
  body: string;
  from?: string;
  clientId?: string;
}
