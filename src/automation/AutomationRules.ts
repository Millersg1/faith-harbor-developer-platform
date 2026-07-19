import type { InvoiceRecord } from "../accounting/InvoiceRecord";
import type { ClientRecord } from "../clients/ClientTypes";
import type { ProjectRecord } from "../projects/ProjectRecord";
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

/**
 * Builds a project kickoff (onboarding) email draft.
 *
 * Prepared when a project starts — whether created directly or from
 * an accepted proposal — to welcome the client into delivery and set
 * expectations for what happens next.
 *
 * Returns null when the client has no email address on file.
 */
export function buildProjectOnboardingDraft(
  project: ProjectRecord,
  client: ClientRecord,
): DraftContent | null {
  const to = client.email?.trim();

  if (!to) {
    return null;
  }

  const greetingName =
    client.primaryContact?.trim() ||
    client.companyName.trim();

  const projectName =
    project.name.trim();

  const body =
    `Hi ${greetingName},\n\n` +
    `We are excited to get started on ${projectName}. ` +
    "Thank you for trusting Faith Harbor Web Solutions with this work.\n\n" +
    "Here is what happens next:\n" +
    "  1. We will confirm the details and timeline with you.\n" +
    "  2. You will have a single point of contact for the whole project.\n" +
    "  3. We will keep you updated at every step and invite your feedback.\n\n" +
    "If you have any questions in the meantime, just reply to this email. " +
    "We are honored to serve you.\n\n" +
    signature;

  return {
    title: `Onboarding email for ${projectName}`,
    to,
    subject: `Getting started on ${projectName}`,
    body,
    clientId: client.id,
  };
}

/**
 * Formats a currency amount for an invoice body.
 */
function formatAmount(
  amount: number,
  currency: string,
): string {
  const formatted =
    amount.toFixed(2);

  return `${currency} ${formatted}`;
}

/**
 * Builds a gentle payment-reminder email draft for an overdue invoice.
 *
 * Returns null when the client has no email address on file. The
 * caller is responsible for deciding *which* invoices are overdue;
 * this only writes the message.
 */
export function buildInvoiceReminderDraft(
  invoice: InvoiceRecord,
  client: ClientRecord,
): DraftContent | null {
  const to = client.email?.trim();

  if (!to) {
    return null;
  }

  const greetingName =
    client.primaryContact?.trim() ||
    client.companyName.trim();

  const amount =
    formatAmount(
      invoice.amount,
      invoice.currency,
    );

  const dueLine = invoice.dueDate
    ? `It was due on ${invoice.dueDate}.`
    : "It is now past due.";

  const body =
    `Hi ${greetingName},\n\n` +
    `This is a friendly reminder about invoice ${invoice.number} for ${amount}. ` +
    dueLine +
    "\n\n" +
    "If you have already sent payment, thank you — please disregard this note. " +
    "If not, you can reply to this email with any questions and we will be glad to help.\n\n" +
    "We appreciate your partnership and the opportunity to serve you.\n\n" +
    signature;

  return {
    title: `Payment reminder for ${invoice.number}`,
    to,
    subject: `Friendly reminder: invoice ${invoice.number}`,
    body,
    clientId: client.id,
  };
}

/**
 * Builds a follow-up email draft for a lead that has gone quiet.
 *
 * Prepared when an open lead has not been touched for a while, to
 * gently re-open the conversation. Returns null when the lead has no
 * email address on file.
 */
export function buildLeadFollowUpDraft(
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
    lead.name.trim() || audience;

  const interest =
    lead.serviceInterest?.trim();

  const interestLine = interest
    ? `We had talked about ${interest}, and I did not want it to slip through the cracks.`
    : "I wanted to follow up and see if we can help with anything.";

  const body =
    `Hi ${greetingName},\n\n` +
    "I hope you are doing well. " +
    interestLine +
    "\n\n" +
    "There is no rush and no pressure at all — if the timing is not right, just let me know and I will check back later. " +
    "If you do have any questions, simply reply to this email and I am glad to help.\n\n" +
    signature;

  return {
    title: `Follow-up email to ${audience}`,
    to,
    subject:
      "Just checking in from Faith Harbor",
    body,
    clientId: lead.clientId,
  };
}

/**
 * Builds a check-in email draft for a project that has stalled.
 *
 * Prepared when an active project has not been updated for a while,
 * to reassure the client and keep the relationship warm. Returns null
 * when the client has no email address on file.
 */
export function buildProjectCheckInDraft(
  project: ProjectRecord,
  client: ClientRecord,
): DraftContent | null {
  const to = client.email?.trim();

  if (!to) {
    return null;
  }

  const greetingName =
    client.primaryContact?.trim() ||
    client.companyName.trim();

  const projectName =
    project.name.trim();

  const body =
    `Hi ${greetingName},\n\n` +
    `I wanted to give you a quick check-in on ${projectName}. ` +
    "We have not connected in a little while, and I want to make sure you feel taken care of.\n\n" +
    "If there is anything you need from us, or any question on your mind, just reply to this email. " +
    "We are grateful for the chance to serve you and want to keep things moving well.\n\n" +
    signature;

  return {
    title: `Check-in email for ${projectName}`,
    to,
    subject: `Checking in on ${projectName}`,
    body,
    clientId: client.id,
  };
}

/**
 * The details needed to draft a Google review request.
 */
export interface ReviewRequestContent {
  customerName: string;
  customerEmail: string;
  businessName: string;
  reviewUrl: string;
  clientId?: string;
}

/**
 * Builds a Google review-request email draft.
 *
 * The email is branded for the client's business (not Faith Harbor),
 * since it is sent to that business's own customer. It asks every
 * customer the same way — no sentiment screening or "review gating,"
 * which Google prohibits. Returns null without a recipient or link.
 */
export function buildReviewRequestDraft(
  input: ReviewRequestContent,
): DraftContent | null {
  const to =
    input.customerEmail?.trim();

  const reviewUrl =
    input.reviewUrl?.trim();

  if (!to || !reviewUrl) {
    return null;
  }

  const business =
    input.businessName.trim() ||
    "our business";

  const name =
    input.customerName.trim() ||
    "there";

  const body =
    `Hi ${name},\n\n` +
    `Thank you for choosing ${business}! We hope you had a great experience.\n\n` +
    "Would you take a moment to share your experience in a quick Google review? " +
    "It genuinely helps us and makes it easier for others to find us.\n\n" +
    `Leave a review here: ${reviewUrl}\n\n` +
    "Thank you so much for your time and your trust.\n\n" +
    `Warm regards,\n` +
    `The ${business} Team`;

  return {
    title: `Review request to ${name} (${business})`,
    to,
    subject: `How did we do, ${name}?`,
    body,
    clientId: input.clientId,
  };
}
