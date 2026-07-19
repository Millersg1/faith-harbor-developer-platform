/**
 * The business event that produced an automation draft.
 *
 * The automation engine never acts on an event directly. Instead it
 * prepares a draft action and waits for a human to approve it, so a
 * person is always in the loop before anything leaves Faith Harbor.
 */
export type AutomationTrigger =
  | "lead.created"
  | "project.created"
  | "invoice.overdue"
  | "lead.quiet"
  | "project.stalled"
  | "review.requested";

/**
 * Where an automation draft is in its life cycle.
 *
 * pending
 *   Prepared by the engine and waiting for a human decision.
 *
 * approved
 *   A human approved it and the action was carried out (for an
 *   email draft, the message was handed to the email service).
 *
 * dismissed
 *   A human declined it; nothing was sent.
 */
export type AutomationStatus =
  | "pending"
  | "approved"
  | "dismissed";

/**
 * A proposed action prepared by the automation engine.
 *
 * Today every draft is an email. The shape leaves room for other
 * action kinds later without changing the approval flow.
 */
export interface AutomationDraft {
  id: string;

  /**
   * The event that produced this draft.
   */
  trigger: AutomationTrigger;

  /**
   * A short human summary, e.g. "Welcome email to Acme Co.".
   */
  title: string;

  /**
   * The proposed email recipient.
   */
  to: string;

  /**
   * The proposed email subject.
   */
  subject: string;

  /**
   * The proposed email body.
   */
  body: string;

  status: AutomationStatus;

  /**
   * The kind of record the draft relates to, e.g. "lead".
   */
  relatedType: string;

  /**
   * The id of the related record.
   */
  relatedId: string;

  /**
   * The client this draft relates to, when known.
   */
  clientId?: string;

  /**
   * The outbox email id, set once an approved draft is sent.
   */
  emailId?: string;

  createdAt: string;

  /**
   * When the draft was approved or dismissed.
   */
  resolvedAt?: string;
}
