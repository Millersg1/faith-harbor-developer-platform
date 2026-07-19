import type { LeadRecord } from "../sales/LeadRecord";

/**
 * The content of a proposed email, before it becomes a stored draft.
 */
export interface DraftContent {
  title: string;
  to: string;
  subject: string;
  body: string;
  clientId?: string;
}

/**
 * The signature on the Faith Harbor outbound emails the engine drafts.
 *
 * Kept plain so a human can edit it before approving, and so the
 * ministry-forward voice of the business comes through.
 */
const signature =
  "Warmly,\n" +
  "Pastor Shawn Miller\n" +
  "Faith Harbor Web Solutions\n\n" +
  "Technology is our tool. People are our purpose. Christ is our foundation.";

/**
 * Builds a welcome-email draft for a newly created lead.
 *
 * Returns null when the lead has no email address, because there is
 * no one to write to. The engine simply skips drafting in that case.
 */
export function buildLeadWelcomeDraft(
  lead: LeadRecord,
): DraftContent | null {
  const to = lead.email?.trim();

  if (!to) {
    return null;
  }

  const audience =
    lead.company?.trim() ||
    lead.name.trim();

  const greetingName =
    lead.name.trim() ||
    audience;

  const interest =
    lead.serviceInterest?.trim();

  const interestLine = interest
    ? `You mentioned an interest in ${interest}, and I would love to learn more about what you have in mind.`
    : "I would love to learn more about your goals and how we can help.";

  const body =
    `Hi ${greetingName},\n\n` +
    "Thank you for reaching out to Faith Harbor Web Solutions. " +
    interestLine +
    "\n\n" +
    "Whenever you are ready, just reply to this email and we can set up a time to talk. " +
    "There is no pressure at all — we are here to serve you.\n\n" +
    signature;

  return {
    title: `Welcome email to ${audience}`,
    to,
    subject:
      "Welcome to Faith Harbor Web Solutions",
    body,
    clientId: lead.clientId,
  };
}
