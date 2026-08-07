/**
 * Provider-independent email delivery boundary.
 *
 * Everything above this line (consent, suppression, double opt-in, sequences,
 * enrollments, scheduling, the outbox, retries, crash recovery, unsubscribe,
 * metering, audit, reporting) is transport-agnostic. Only implementations of
 * {@link EmailDeliveryProvider} know HOW a message is transmitted, so we can add
 * a MailgunEmailDeliveryProvider later without touching any of it.
 *
 * IMPORTANT HONESTY BOUNDARY: `accepted` means the receiving SMTP server took
 * responsibility for the message. It does NOT prove delivery, inbox placement,
 * reading, or engagement. Ambiguous/interrupted attempts are `uncertain` and
 * must never be blind-resent.
 */

/** Transactional email must never be delayed by marketing volume/failures. */
export type MessageClass = "transactional" | "marketing";

export interface DeliveryRequest {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  /** Plain-text body — ALWAYS present. */
  text: string;
  /** Optional safe HTML alternative. */
  html?: string;
  /** Extra headers (e.g. List-Unsubscribe). CR/LF-validated before send. */
  headers?: Record<string, string>;
  /**
   * Stable LOGICAL id for this message (e.g. `${enrollmentId}:${stepIndex}`).
   * Constant across retries — the correlation handle.
   */
  logicalId: string;
  /** Unique id for THIS attempt. A deliberate retry gets a new one. */
  attemptId: string;
  /** Sending domain for the Message-ID (an approved AEC/tenant domain). */
  sendingDomain: string;
  messageClass: MessageClass;
}

export type DeliveryClassification =
  /** Server accepted responsibility (≠ delivered/inbox). Meter here, once. */
  | "accepted"
  /** Permanent pre-acceptance rejection (5xx / header injection). No retry. */
  | "rejected"
  /** Failure clearly BEFORE acceptance (connection/auth/DNS/TLS/4xx). Retry. */
  | "pre_acceptance_failure"
  /** Interrupted/ambiguous — may or may not have been accepted. No auto-retry. */
  | "uncertain";

export interface DeliveryResult {
  classification: DeliveryClassification;
  /** Correlation id we can prove (our Message-ID). Never a recipient address. */
  providerId?: string;
  messageId?: string;
  /** Sanitized, compact category — never PII, credentials, or full response. */
  responseCategory?: string;
  /** Short, PII/secret-scrubbed reason for non-accepted outcomes. */
  reason?: string;
  acceptedCount: number;
  rejectedCount: number;
}

export interface EmailDeliveryProvider {
  readonly name: string;
  deliver(request: DeliveryRequest): Promise<DeliveryResult>;
}

/**
 * Deterministic Message-ID. NEW per ATTEMPT (each transmission is a distinct
 * RFC message) but derived from the stable logical id, so history stays
 * correlated. Format: `<logicalId.attemptId@domain>` (value without brackets).
 */
export function buildMessageId(
  logicalId: string,
  attemptId: string,
  domain: string,
): string {
  const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, "");
  return `${safe(logicalId)}.${safe(attemptId)}@${safe(domain) || "localhost"}`;
}

/** True if a header field is free of CR/LF/NUL (injection-safe). */
export function isHeaderSafe(value: string): boolean {
  return !/[\r\n\0]/.test(value);
}

/**
 * Scrub a transport error into a compact, PII/secret-free reason. Strips
 * anything email-address-like and never surfaces credentials.
 */
export function scrubReason(raw: string | undefined): string {
  if (!raw) return "unknown";
  return raw
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "<redacted>")
    .replace(/\b(pass(word)?|secret|token|auth)\b\S*/gi, "<redacted>")
    .slice(0, 120);
}

/**
 * Classify a raw SMTP/transport error into a delivery classification +
 * sanitized category. Only failures CLEARLY before acceptance are retryable;
 * genuinely ambiguous interruptions are `uncertain` (never auto-retried). A TLS
 * failure is pre-acceptance and never downgraded/retried insecurely.
 */
export function classifySmtpError(raw: string | undefined): {
  classification: DeliveryClassification;
  responseCategory: string;
} {
  const e = (raw ?? "").toLowerCase();
  if (/tls|ssl|certificate|self.signed|handshake/.test(e)) {
    return { classification: "pre_acceptance_failure", responseCategory: "tls" };
  }
  if (/auth|535|534|530|credential/.test(e)) {
    return { classification: "pre_acceptance_failure", responseCategory: "auth" };
  }
  if (
    /econnrefused|enotfound|ehostunreach|enetunreach|getaddrinfo|dns|connect etimedout|connection timed out|could not connect/.test(
      e,
    )
  ) {
    return {
      classification: "pre_acceptance_failure",
      responseCategory: "connection",
    };
  }
  if (/replied "5|\b5\d\d\b|550|554|permanent/.test(e)) {
    return { classification: "rejected", responseCategory: "smtp_5xx" };
  }
  if (/replied "4|\b4\d\d\b|greylist|temporar/.test(e)) {
    return {
      classification: "pre_acceptance_failure",
      responseCategory: "smtp_4xx",
    };
  }
  // Socket dropped / conversation timeout / reset mid-transaction: we cannot
  // tell whether DATA was accepted → ambiguous.
  if (
    /conversation timed out|socket hang up|econnreset|epipe|write after end|timed out/.test(
      e,
    )
  ) {
    return { classification: "uncertain", responseCategory: "ambiguous" };
  }
  return { classification: "uncertain", responseCategory: "unknown" };
}
