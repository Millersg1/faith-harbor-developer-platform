/**
 * Transactional domain-notice TEMPLATES (Stage 11). These render the customer-
 * facing subject + plain text for each lifecycle STATE. They are transactional
 * only and are delivered through the platform's `EmailDeliveryProvider`
 * (messageClass "transactional") — this module sends nothing itself.
 *
 * Honesty rules baked into the copy:
 *  - each state is described truthfully and distinctly (requested ≠ paid ≠
 *    submitted ≠ registered/renewed/transferred ≠ refunded ≠ unknown ≠
 *    needs_attention);
 *  - "submitted" never claims completion; "unknown" states that we reconcile
 *    read-only and neither retry nor refund until confirmed;
 *  - NO propagation or transfer-completion TIME is ever promised;
 *  - server ACCEPTANCE of an email is never described to the customer as
 *    "delivery" (that classification lives in the delivery layer, not the copy).
 */

export type DomainNoticeState =
  | "requested"
  | "paid"
  | "submitted"
  | "registered"
  | "renewed"
  | "transferred"
  | "refunded"
  | "unknown"
  | "needs_attention";

export type DomainOperation = "registration" | "renewal" | "transfer";

export interface DomainNoticeContext {
  domain: string;
  operation?: DomainOperation;
}

export interface RenderedNotice {
  subject: string;
  text: string;
  messageClass: "transactional";
}

function opWord(op: DomainOperation | undefined): string {
  return op === "renewal" ? "renewal" : op === "transfer" ? "transfer" : "registration";
}

export function renderDomainNotice(state: DomainNoticeState, ctx: DomainNoticeContext): RenderedNotice {
  const d = ctx.domain;
  const op = opWord(ctx.operation);
  const tx = { messageClass: "transactional" as const };
  switch (state) {
    case "requested":
      return { subject: `We received your ${op} request for ${d}`,
        text: `We received your ${op} request for ${d}. Payment is pending — no ${op} has been performed yet. We'll email you as each step happens.`, ...tx };
    case "paid":
      return { subject: `Payment received for ${d}`,
        text: `Your payment for the ${op} of ${d} was captured. The ${op} has not completed yet; we'll process it next and let you know the result.`, ...tx };
    case "submitted":
      return { subject: `${d}: ${op} submitted to the registrar`,
        text: `The ${op} for ${d} has been submitted to the registrar. It is not complete yet. Registry and registrar timing applies and a completion time cannot be guaranteed. We'll confirm the outcome.`, ...tx };
    case "registered":
      return { subject: `${d} is registered`,
        text: `${d} is registered and you are the registered name holder. Any nameserver or DNS changes are made only when you request them.`, ...tx };
    case "renewed":
      return { subject: `${d} was renewed`,
        text: `${d} was renewed. The new expiration date is the one the registrar confirms, shown in your dashboard once we verify it with the registrar.`, ...tx };
    case "transferred":
      return { subject: `${d}: transfer completed`,
        text: `The transfer of ${d} has completed. Your existing nameservers were preserved; we did not change DNS, nameservers, or hosting as part of the transfer.`, ...tx };
    case "refunded":
      return { subject: `Refund issued for ${d}`,
        text: `A refund for ${d} was issued to your original payment method. The time it takes to appear on your statement is set by your bank and card network.`, ...tx };
    case "unknown":
      return { subject: `${d}: we're confirming the outcome`,
        text: `The outcome of the ${op} for ${d} is not yet confirmed. We are reconciling it read-only with the registrar. We will NOT retry it or issue a refund until we confirm what actually happened.`, ...tx };
    case "needs_attention":
      return { subject: `Action needed for ${d}`,
        text: `${d} needs your attention. Please review it in your domains dashboard to continue.`, ...tx };
  }
}

/**
 * Renders the subject/body for a persisted `notice_type` (the value the lifecycle
 * scanners enqueue), as opposed to a saga lifecycle STATE above. Returns `null`
 * for a type we have no honest template for — the delivery worker then SKIPS the
 * notice rather than sending an empty or guessed message. Every string here is a
 * REMINDER or ACTION-REQUIRED prompt: none asserts completion, timing, or that a
 * registry deadline exists that the provider did not report.
 */
export function renderNoticeByType(noticeType: string, ctx: DomainNoticeContext): RenderedNotice | null {
  const d = ctx.domain;
  const tx = { messageClass: "transactional" as const };
  switch (noticeType) {
    case "renewal_reminder":
      return { subject: `Reminder: ${d} is approaching its renewal date`,
        text: `This is a reminder that ${d} is approaching the renewal date the registrar has on file. No renewal has been performed by this notice. You can review or renew it in your domains dashboard.`, ...tx };
    case "expiration_grace_redemption_warning":
      return { subject: `Action may be needed: ${d} is at or past its expiration date`,
        text: `${d} is at or past the expiration date the registrar reports. Options and timing after expiration are set by the registry and registrar; we do not invent grace, redemption, or deletion deadlines. Please review ${d} in your domains dashboard to decide how to proceed.`, ...tx };
    case "contact_verification_required":
      return { subject: `Action required: verify the registrant contact for ${d}`,
        text: `The registry or registrar reports that registrant verification is required for ${d}. This must be completed through the registrar's own verification process. Please review ${d} in your domains dashboard.`, ...tx };
    case "auto_renew_action_required":
      return { subject: `Action needed: automatic renewal for ${d} could not proceed`,
        text: `Automatic renewal for ${d} could not proceed and no renewal was performed. This usually means a saved payment method needs your attention. Please review ${d} in your domains dashboard to renew it.`, ...tx };
    default:
      return null;
  }
}

/** Whether copy dangerously promises timing/propagation (used by tests + review). */
export function promisesForbiddenTiming(text: string): boolean {
  return /\binstant(ly|aneous)?\b/i.test(text)
    || /within\s+\d+\s*(second|minute|hour|day)/i.test(text)
    || /guaranteed\s+to\s+(complete|propagate|finish)/i.test(text)
    || /\bpropagat\w*\s+(in|within|by)\b/i.test(text);
}
