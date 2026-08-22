import { describe, expect, it } from "vitest";

import type { DeliveryRequest, DeliveryResult, EmailDeliveryProvider } from "../../email/EmailDeliveryProvider";
import {
  promisesForbiddenTiming,
  renderDomainNotice,
  type DomainNoticeState,
} from "./domainNoticeTemplates";

/** Captured transport — records requests, sends nothing. */
class CaptureProvider implements EmailDeliveryProvider {
  readonly name = "capture";
  readonly sent: DeliveryRequest[] = [];
  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    this.sent.push(request);
    // "accepted" means the server took responsibility — NOT delivered/inbox.
    return { classification: "accepted", acceptedCount: 1, rejectedCount: 0, messageId: "m1" };
  }
}

const STATES: DomainNoticeState[] = [
  "requested", "paid", "submitted", "registered", "renewed", "transferred", "refunded", "unknown", "needs_attention",
];

describe("Stage 11 — domain transactional notices (captured transport, no send)", () => {
  it("renders every lifecycle state distinctly and honestly", () => {
    const subjects = new Set<string>();
    for (const state of STATES) {
      const n = renderDomainNotice(state, { domain: "acme.com", operation: "registration" });
      expect(n.subject.length).toBeGreaterThan(0);
      expect(n.text).toContain("acme.com");
      expect(n.messageClass).toBe("transactional");
      subjects.add(n.subject);
      // No template promises propagation/transfer/renewal timing.
      expect(promisesForbiddenTiming(n.text)).toBe(false);
    }
    expect(subjects.size).toBe(STATES.length); // each state is distinct
  });

  it("submitted never claims completion; unknown states no-retry/no-refund honesty", () => {
    const submitted = renderDomainNotice("submitted", { domain: "acme.com", operation: "transfer" });
    expect(submitted.text).toMatch(/not complete|cannot be guaranteed/i);
    expect(submitted.text.toLowerCase()).not.toContain("completed");
    const unknown = renderDomainNotice("unknown", { domain: "acme.com", operation: "registration" });
    expect(unknown.text).toMatch(/not\s+retry/i);
    expect(unknown.text).toMatch(/reconcil/i);
  });

  it("delivers through the transactional boundary without sending real email", async () => {
    const provider = new CaptureProvider();
    for (const state of STATES) {
      const n = renderDomainNotice(state, { domain: "acme.com", operation: "renewal" });
      const req: DeliveryRequest = {
        to: "owner@example.com", from: "notices@allelitecloud.com", subject: n.subject, text: n.text,
        logicalId: `domain-${state}:reg1`, attemptId: `a-${state}`, sendingDomain: "allelitecloud.com",
        messageClass: n.messageClass,
      };
      const res = await provider.deliver(req);
      // Acceptance is not delivery.
      expect(res.classification).toBe("accepted");
    }
    expect(provider.sent.length).toBe(STATES.length);
    expect(provider.sent.every((r) => r.messageClass === "transactional")).toBe(true);
    // Transactional: no marketing unsubscribe headers.
    expect(provider.sent.every((r) => !(r.headers && "List-Unsubscribe" in r.headers))).toBe(true);
  });

  it("the forbidden-timing guard actually catches bad copy", () => {
    expect(promisesForbiddenTiming("Your DNS will propagate within 2 hours.")).toBe(true);
    expect(promisesForbiddenTiming("Changes are instant.")).toBe(true);
    expect(promisesForbiddenTiming("Timing is set by the registry and cannot be guaranteed.")).toBe(false);
  });
});
