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
