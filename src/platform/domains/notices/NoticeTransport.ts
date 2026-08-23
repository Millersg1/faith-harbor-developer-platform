/**
 * The delivery seam for transactional domain notices. In this credential-free
 * release NOTHING is ever sent: the only wired transport is `CapturedNoticeSink`,
 * which records what WOULD be sent and returns a configurable server-acceptance
 * classification. A real transport (platform `EmailDeliveryProvider`) is an
 * explicitly deferred item and is never constructed here.
 *
 * The four classifications map the honest truth of an SMTP submission:
 *  - `accepted`               — the receiving server ACCEPTED the message for
 *                               relay. This is acceptance, NOT proof of delivery
 *                               to the inbox (the worker never claims "delivered").
 *  - `rejected`               — the server definitively refused it (e.g. 5xx). A
 *                               terminal, no-retry failure.
 *  - `pre_acceptance_failure` — we never got an acceptance verdict at all (DNS,
 *                               connect, TLS, timeout before a reply). Safe to
 *                               retry with backoff — nothing was accepted.
 *  - `uncertain`              — an AMBIGUOUS acceptance (e.g. the connection
 *                               dropped after DATA with no clean final reply). The
 *                               message MAY have been accepted, so it must NEVER
 *                               be blindly resent; the worker parks it as
 *                               `delivery_unknown` for human reconciliation.
 */

export type NoticeDeliveryClassification =
  | "accepted"
  | "rejected"
  | "pre_acceptance_failure"
  | "uncertain";

/** What a transport is asked to send. Assembled at delivery time, never stored. */
export interface NoticeDeliveryRequest {
  to: string;
  from: string;
  subject: string;
  text: string;
  /** Always transactional — no marketing headers, list-unsubscribe, or metering. */
  messageClass: "transactional";
  /** Stable logical id for the transport's own idempotency, if it supports it. */
  logicalId: string;
}

export interface NoticeDeliveryResult {
  classification: NoticeDeliveryClassification;
  /** Opaque provider handle (NOT persisted in notice rows). Optional. */
  providerMessageId?: string;
  /** Coarse, non-PII reason string for the attempt log. */
  reason?: string;
}

export interface NoticeTransport {
  deliver(request: NoticeDeliveryRequest): Promise<NoticeDeliveryResult>;
}

/** One captured (unsent) delivery, for dev inspection + tests. */
export interface CapturedNotice {
  to: string;
  from: string;
  subject: string;
  text: string;
  logicalId: string;
  at: string;
}

/**
 * Captured, SEND-NOTHING transport. Records every request in memory and returns
 * a preset classification (default `accepted`). This is the ONLY transport the
 * runtime wires; it guarantees no external email is emitted.
 */
export class CapturedNoticeSink implements NoticeTransport {
  readonly captured: CapturedNotice[] = [];

  constructor(
    private readonly outcome: (req: NoticeDeliveryRequest, n: number) => NoticeDeliveryResult =
      () => ({ classification: "accepted", reason: "captured_no_send" }),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async deliver(request: NoticeDeliveryRequest): Promise<NoticeDeliveryResult> {
    this.captured.push({
      to: request.to, from: request.from, subject: request.subject,
      text: request.text, logicalId: request.logicalId, at: this.clock(),
    });
    return this.outcome(request, this.captured.length);
  }
}
