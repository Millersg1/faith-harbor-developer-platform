/**
 * The domain-registration Stripe webhook boundary (Stripe TEST MODE only).
 *
 * This is the single, hardened entry point the HTTP route delegates to. It never
 * trusts the payload until the signature over the EXACT raw body verifies, and
 * it never trusts webhook metadata for money decisions — the owning saga re-reads
 * the PaymentIntent from Stripe and matches it against the STORED order before
 * capturing. Safety rules enforced here:
 *
 *  - the raw body is size-bounded (a giant body is rejected, not parsed);
 *  - a missing / malformed / stale / wrongly-signed signature is rejected (the
 *    gateway's verify enforces the 5-minute timestamp tolerance);
 *  - a LIVE-mode event is rejected outright — this endpoint is test-mode only;
 *  - JSON is parsed ONLY after the signature verifies;
 *  - the event is routed to the saga that OWNS the checkout (looked up by the
 *    server-stored checkout id — never by anything the client controls), across
 *    purchase / renewal / transfer channels;
 *  - duplicate / reordered / delayed events converge safely: each saga dedups on
 *    the event id (durable `stripe_processed_events`) and is idempotent once a
 *    payment is already captured;
 *  - browser success/cancel redirects never reach this path, so they can never
 *    fulfil an order;
 *  - a processing error still ACKs 200 (so Stripe does not hammer retries) while
 *    the order stays in its durable state for the worker/reconciler to resolve.
 */

import type { DomainStripeGateway } from "./DomainStripeGateway";

export interface DomainWebhookArgs {
  eventId: string;
  rawBody: string;
  signature: string;
  checkoutId: string;
  paymentIntentId: string;
}

/** One fulfilment channel (purchase / renewal / transfer). */
export interface DomainWebhookChannel {
  readonly name: string;
  /** True iff this channel owns the given (server-stored) checkout id. */
  owns(checkoutId: string): Promise<boolean>;
  /** Process the verified event. Must be idempotent + dedup internally. */
  handle(args: DomainWebhookArgs): Promise<void>;
}

export interface DomainWebhookResult {
  status: number;
  body: Record<string, unknown>;
  /** PII-free classification for the caller to log (never contains payload). */
  outcome:
    | "processed"
    | "ignored_unhandled_type"
    | "ignored_unknown_checkout"
    | "rejected_signature"
    | "rejected_malformed"
    | "rejected_livemode"
    | "rejected_too_large"
    | "processing_error";
  channel?: string;
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576; // 1 MiB — Stripe events are far smaller

export class DomainWebhookHandler {
  private readonly maxBodyBytes: number;

  constructor(
    private readonly gateway: DomainStripeGateway,
    private readonly channels: DomainWebhookChannel[],
    opts?: { maxBodyBytes?: number },
  ) {
    this.maxBodyBytes = opts?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  }

  async handle(rawBody: string, signature: string | undefined): Promise<DomainWebhookResult> {
    // 1. Bound the body BEFORE parsing (defence in depth; the route also caps it).
    if (Buffer.byteLength(rawBody, "utf8") > this.maxBodyBytes) {
      return { status: 413, body: err("PAYLOAD_TOO_LARGE", "Webhook body too large."), outcome: "rejected_too_large" };
    }
    // 2. Verify the signature over the EXACT raw bytes (rejects missing/stale/bad).
    if (!signature || !this.gateway.verifyWebhook(rawBody, signature)) {
      return { status: 400, body: err("INVALID_SIGNATURE", "Invalid webhook signature."), outcome: "rejected_signature" };
    }
    // 3. Only now parse.
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: err("MALFORMED", "Malformed webhook body."), outcome: "rejected_malformed" };
    }
    if (!event || typeof event !== "object") {
      return { status: 400, body: err("MALFORMED", "Malformed webhook event."), outcome: "rejected_malformed" };
    }
    const ev = event as {
      id?: unknown; type?: unknown; livemode?: unknown;
      data?: { object?: { id?: unknown; payment_intent?: unknown } };
    };
    // 4. Test-mode only: a live event is rejected outright.
    if (ev.livemode !== false) {
      return { status: 400, body: err("LIVEMODE_REJECTED", "Live-mode events are not accepted by the test endpoint."), outcome: "rejected_livemode" };
    }
    // 5. We only act on completed checkouts; anything else is a safe no-op ack.
    if (ev.type !== "checkout.session.completed") {
      return { status: 200, body: { received: true, ignored: "unhandled_type" }, outcome: "ignored_unhandled_type" };
    }
    const eventId = typeof ev.id === "string" ? ev.id : "";
    const checkoutId = typeof ev.data?.object?.id === "string" ? ev.data.object.id : "";
    const paymentIntentId = typeof ev.data?.object?.payment_intent === "string" ? ev.data.object.payment_intent : "";
    if (!eventId || !checkoutId || !paymentIntentId) {
      return { status: 400, body: err("MALFORMED", "Missing event/checkout/payment_intent id."), outcome: "rejected_malformed" };
    }
    // 6. Route by the SERVER-STORED checkout id (never client-controlled).
    for (const channel of this.channels) {
      if (!(await channel.owns(checkoutId))) continue;
      try {
        await channel.handle({ eventId, rawBody, signature, checkoutId, paymentIntentId });
        return { status: 200, body: { received: true }, outcome: "processed", channel: channel.name };
      } catch {
        // Ack 200 so Stripe doesn't storm retries; the order stays in its durable
        // state and the worker/reconciler converges it. No payload is surfaced.
        return { status: 200, body: { received: true }, outcome: "processing_error", channel: channel.name };
      }
    }
    // 7. Unknown checkout (foreign / already-swept) — safe ack, nothing acted on.
    return { status: 200, body: { received: true, ignored: "unknown_checkout" }, outcome: "ignored_unknown_checkout" };
  }
}

function err(code: string, message: string): Record<string, unknown> {
  return { error: { code, message } };
}
