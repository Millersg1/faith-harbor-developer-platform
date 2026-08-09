import { randomUUID } from "node:crypto";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { EmailDeliveryProvider } from "../email/EmailDeliveryProvider";
import type { DripService } from "../drip/DripService";
import type { PlatformLeadService } from "../crm/PlatformLeadService";
import { buildMarketingEmail } from "./marketingEmailContent";
import type { EmailSuppressionService, UnsubscribeService } from "./EmailSuppressionService";
import type { MarketingConsentService } from "./MarketingConsentService";
import type { MarketingSenderService } from "./MarketingSenderService";
import type { OutboxMessage } from "./MarketingOutboxService";
import type {
  MarketingSendDecision,
  MarketingSendResult,
} from "./MarketingWorker";

/**
 * Final SEND-TIME eligibility for one marketing message. Runs immediately before
 * the SMTP attempt (inside the message's tenant scope) and returns a SPECIFIC
 * durable decision — never an endless retry. It rechecks everything that could
 * have changed after enqueue:
 *   enrollment active · bound sequence exists/owned/active · matching+confirmed
 *   consent · tenant+global suppression · lead active · approved sender identity
 *   with business name + physical address.
 * (Tenant/sequence pause and rate/concurrency limits are enforced by the worker
 * BEFORE this runs.)
 */
export function createMarketingEligibility(deps: {
  consent: MarketingConsentService;
  suppression: EmailSuppressionService;
  leads: PlatformLeadService;
  drip: DripService;
  marketingSender: MarketingSenderService;
}): (m: OutboxMessage) => Promise<MarketingSendDecision> {
  return (m) =>
    runWithTenant({ organizationId: m.organizationId }, async (): Promise<MarketingSendDecision> => {
      // Enrollment still active?
      if (m.enrollmentId) {
        const enr = await deps.drip.getEnrollment(m.enrollmentId);
        if (!enr || enr.status !== "active") {
          return { kind: "skip", reason: "enrollment_inactive" };
        }
        if (enr.organizationId !== m.organizationId) {
          return { kind: "terminal", reason: "tenant_mismatch" };
        }
      }
      // Bound sequence still valid?
      if (m.sequenceId) {
        try {
          const seq = await deps.drip.getSequence(m.sequenceId);
          if (seq.organizationId !== m.organizationId) {
            return { kind: "terminal", reason: "sequence_tenant_mismatch" };
          }
          if (seq.status !== "active") {
            return { kind: "defer", reason: "sequence_paused" };
          }
        } catch {
          return { kind: "terminal", reason: "sequence_not_found" };
        }
      }
      // Matching, confirmed consent.
      if (!(await deps.consent.hasConfirmedConsent(m.email))) {
        return { kind: "skip", reason: "consent_withdrawn" };
      }
      // Tenant OR global suppression.
      const deliverable = await deps.suppression.marketingDeliverability(
        m.organizationId,
        m.email,
      );
      if (!deliverable.eligible) {
        return { kind: "skip", reason: `suppressed_${deliverable.reason ?? "yes"}` };
      }
      // Lead not explicitly lost.
      const lead = await deps.leads.findByEmail(m.email);
      if (lead && lead.status === "lost") {
        return { kind: "skip", reason: "lead_inactive" };
      }
      // Approved sender identity resolved AT SEND TIME (a removed/invalid sender
      // stops queued messages) — an owner action item, not an endless retry.
      const resolution = await deps.marketingSender.resolve();
      if (!resolution.ok) {
        return { kind: "needs_attention", reason: `sender_${resolution.reason}` };
      }
      return { kind: "send" };
    });
}

/**
 * The marketing SEND — a real marketing message WITH RFC-8058 unsubscribe
 * headers (List-Unsubscribe + one-click) and a visible unsubscribe link, built
 * by {@link buildMarketingEmail}. Resolves the sender at send time (fail →
 * pre-acceptance, retryable) and returns an honest classification. Never leaks
 * addresses/SMTP internals to the worker.
 */
export function createMarketingSend(deps: {
  marketingSender: MarketingSenderService;
  emailProvider: EmailDeliveryProvider;
  unsubscribe: UnsubscribeService;
  /** Base origin for the unsubscribe / one-click URLs (a trusted platform host). */
  unsubscribeBase: string;
}): (m: OutboxMessage) => Promise<MarketingSendResult> {
  return (m) =>
    runWithTenant({ organizationId: m.organizationId }, async (): Promise<MarketingSendResult> => {
      const resolution = await deps.marketingSender.resolve();
      if (!resolution.ok) {
        return {
          classification: "pre_acceptance_failure",
          reason: `sender_${resolution.reason}`,
        };
      }
      const sender = resolution.sender;
      const token = await deps.unsubscribe.mint(m.organizationId, m.email);
      const base = deps.unsubscribeBase.replace(/\/+$/, "");
      const content = buildMarketingEmail({
        sender,
        subject: m.subject,
        text: m.body,
        unsubscribeUrl: `${base}/unsubscribe#u=${token}`,
        oneClickUrl: `${base}/api/unsubscribe/one-click/${token}`,
      });
      const sendingDomain =
        /@([^>\s]+)/.exec(sender.fromAddress)?.[1]?.toLowerCase() ?? "localhost";
      const result = await deps.emailProvider.deliver({
        to: m.email,
        from: content.from,
        replyTo: content.replyTo,
        subject: content.subject,
        text: content.text,
        html: content.html,
        headers: content.headers,
        messageClass: "marketing",
        logicalId: `${m.enrollmentId ?? "adhoc"}:${m.stepIndex}`,
        attemptId: randomUUID(),
        sendingDomain,
      });
      if (result.classification === "accepted") {
        return {
          classification: "accepted",
          providerId: result.providerId,
          messageId: result.messageId,
        };
      }
      return {
        classification: result.classification,
        reason: result.responseCategory ?? result.reason,
      };
    });
}
