import type { EmailTransport } from "../../communications/EmailTransport";
import {
  buildMessageId,
  classifySmtpError,
  isHeaderSafe,
  scrubReason,
  type DeliveryRequest,
  type DeliveryResult,
  type EmailDeliveryProvider,
} from "./EmailDeliveryProvider";

/**
 * Adapts the EXISTING SMTP mail transport (no second sending path, no new
 * credentials) to the provider-independent {@link EmailDeliveryProvider}
 * boundary. It:
 *  - refuses CR/LF header injection in from/replyTo/subject/message-id/headers
 *    (defense-in-depth on top of the transport's own validation);
 *  - stamps a deterministic per-attempt Message-ID;
 *  - maps the transport's coarse result to an honest classification
 *    (accepted / rejected / pre_acceptance_failure / uncertain);
 *  - returns COUNTS + a sanitized category + our Message-ID only — never a
 *    recipient address, response body, or credential.
 *
 * TLS + credentials are owned by the injected transport, which is configured to
 * verify TLS and never downgrade; this adapter never reads or logs credentials
 * and never falls back to an insecure channel.
 */
export class SmtpEmailDeliveryProvider implements EmailDeliveryProvider {
  readonly name = "smtp";

  constructor(private readonly transport: EmailTransport) {}

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    const messageId = buildMessageId(
      request.logicalId,
      request.attemptId,
      request.sendingDomain,
    );

    // Fail closed on any header-injection attempt — never transmit.
    const headerFields = [
      request.from,
      request.to,
      request.subject,
      request.replyTo ?? "",
      messageId,
      ...Object.keys(request.headers ?? {}),
      ...Object.values(request.headers ?? {}),
    ];
    if (headerFields.some((v) => !isHeaderSafe(v))) {
      return {
        classification: "rejected",
        responseCategory: "header_injection",
        reason: "illegal line break in a header field",
        acceptedCount: 0,
        rejectedCount: 1,
      };
    }

    let status: string;
    let error: string | undefined;
    try {
      const result = await this.transport.send({
        from: request.from,
        to: request.to,
        subject: request.subject,
        body: request.text,
        ...(request.html ? { html: request.html } : {}),
        ...(request.replyTo ? { replyTo: request.replyTo } : {}),
        messageId,
        ...(request.headers ? { headers: request.headers } : {}),
      });
      status = result.status;
      error = result.error;
    } catch (e) {
      // A throw from the transport is treated as an ambiguous interruption
      // unless it is a clearly-classified pre-acceptance error.
      status = "failed";
      error = e instanceof Error ? e.message : "send_error";
    }

    if (status === "sent") {
      // Accepted by the SMTP server. NOT proof of inbox delivery.
      return {
        classification: "accepted",
        providerId: messageId,
        messageId,
        responseCategory: "accepted",
        acceptedCount: 1,
        rejectedCount: 0,
      };
    }
    if (status === "logged") {
      // No real provider configured — recorded, not delivered. For marketing
      // this is a misconfiguration to surface, not a success.
      return {
        classification: "pre_acceptance_failure",
        responseCategory: "not_configured",
        reason: "no SMTP provider configured",
        acceptedCount: 0,
        rejectedCount: 1,
      };
    }
    // status === "failed"
    const { classification, responseCategory } = classifySmtpError(error);
    return {
      classification,
      responseCategory,
      reason: scrubReason(error),
      messageId,
      acceptedCount: 0,
      rejectedCount: 1,
    };
  }
}
