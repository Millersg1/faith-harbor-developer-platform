import { describe, expect, it } from "vitest";

import type {
  EmailMessage,
  EmailResult,
} from "../../communications/EmailTypes";
import type { EmailTransport } from "../../communications/EmailTransport";
import { buildMessageId } from "./EmailDeliveryProvider";
import { SmtpEmailDeliveryProvider } from "./SmtpEmailDeliveryProvider";

/** A stub transport that records the message and returns a scripted result. */
function stub(
  result: EmailResult | (() => never),
): { transport: EmailTransport; seen: EmailMessage[] } {
  const seen: EmailMessage[] = [];
  const transport: EmailTransport = {
    send: async (m) => {
      seen.push(m);
      if (typeof result === "function") result();
      return result as EmailResult;
    },
  };
  return { transport, seen };
}

const baseReq = {
  to: "lead@example.com",
  from: "Institute <hello@institute.test>",
  replyTo: "reply@institute.test",
  subject: "Welcome",
  text: "Hello",
  logicalId: "enr-1:0",
  attemptId: "att-1",
  sendingDomain: "institute.test",
  messageClass: "marketing" as const,
};

describe("SmtpEmailDeliveryProvider — honest classification", () => {
  it("accepted when SMTP takes responsibility (not proof of delivery)", async () => {
    const { transport, seen } = stub({ status: "sent", provider: "smtp" });
    const p = new SmtpEmailDeliveryProvider(transport);
    const r = await p.deliver(baseReq);
    expect(r.classification).toBe("accepted");
    expect(r.acceptedCount).toBe(1);
    expect(r.rejectedCount).toBe(0);
    // A deterministic per-attempt Message-ID is stamped.
    expect(r.messageId).toBe(buildMessageId("enr-1:0", "att-1", "institute.test"));
    expect(seen[0].messageId).toBe(r.messageId);
    expect(seen[0].replyTo).toBe("reply@institute.test");
  });

  it("rejects 5xx as permanent (no retry)", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      error: 'SMTP server replied "550 mailbox unavailable"',
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("rejected");
    expect(r.responseCategory).toBe("smtp_5xx");
  });

  it("classifies a connection failure as pre-acceptance (retryable)", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      error: "connect ECONNREFUSED 10.0.0.1:587",
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("pre_acceptance_failure");
    expect(r.responseCategory).toBe("connection");
  });

  it("classifies an authentication failure as pre-acceptance", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      error: 'replied "535 authentication failed"',
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("pre_acceptance_failure");
    expect(r.responseCategory).toBe("auth");
  });

  it("classifies a connect timeout (before acceptance) as pre-acceptance", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      error: "connect ETIMEDOUT",
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("pre_acceptance_failure");
    expect(r.responseCategory).toBe("connection");
  });

  it("classifies an ambiguous interruption as uncertain (no auto-retry)", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      error: "The SMTP conversation timed out.",
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("uncertain");
    expect(r.responseCategory).toBe("ambiguous");
  });

  it("a thrown transport error is handled (ambiguous by default)", async () => {
    const { transport } = stub(() => {
      throw new Error("socket hang up");
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("uncertain");
  });

  it("a TLS failure is pre-acceptance and never downgraded", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      error: "unable to verify the first certificate (TLS)",
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("pre_acceptance_failure");
    expect(r.responseCategory).toBe("tls");
  });

  it("treats a log-only transport as not-configured, not delivered", async () => {
    const { transport } = stub({ status: "logged", provider: "logging" });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    expect(r.classification).toBe("pre_acceptance_failure");
    expect(r.responseCategory).toBe("not_configured");
  });
});

describe("SmtpEmailDeliveryProvider — safety", () => {
  it("refuses CR/LF header injection and never transmits", async () => {
    const { transport, seen } = stub({ status: "sent", provider: "smtp" });
    const p = new SmtpEmailDeliveryProvider(transport);
    const r = await p.deliver({
      ...baseReq,
      subject: "Hi\r\nBcc: victim@example.com",
    });
    expect(r.classification).toBe("rejected");
    expect(r.responseCategory).toBe("header_injection");
    expect(seen).toHaveLength(0); // nothing handed to the transport
  });

  it("the result carries NO recipient address, response body, or secret", async () => {
    const { transport } = stub({
      status: "failed",
      provider: "smtp",
      // A nasty error string that echoes the recipient + a secret.
      error:
        'user lead@example.com rejected; AUTH password=hunter2 "550 blocked"',
    });
    const r = await new SmtpEmailDeliveryProvider(transport).deliver(baseReq);
    const dump = JSON.stringify(r);
    expect(dump).not.toContain("lead@example.com");
    expect(dump).not.toMatch(/hunter2/);
    expect(dump).not.toMatch(/password=/i);
  });

  it("is stateless across calls (restart-safe): each attempt independent", async () => {
    const { transport } = stub({ status: "sent", provider: "smtp" });
    const p = new SmtpEmailDeliveryProvider(transport);
    const a = await p.deliver({ ...baseReq, attemptId: "att-1" });
    const b = await p.deliver({ ...baseReq, attemptId: "att-2" });
    // A new attempt id → a new, distinct Message-ID (unique per transmission),
    // while the logical id stays the correlation handle.
    expect(a.messageId).not.toBe(b.messageId);
    expect(a.messageId).toContain("enr-1:0".replace(/[^A-Za-z0-9._-]/g, ""));
    expect(b.messageId).toContain("enr-1:0".replace(/[^A-Za-z0-9._-]/g, ""));
  });
});
