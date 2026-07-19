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
