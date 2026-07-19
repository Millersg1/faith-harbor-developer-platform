/**
 * Represents the lifecycle of a support ticket.
 *
 * open
 *   Ticket has been received and needs attention.
 *
 * in_progress
 *   Someone is actively working on the ticket.
 *
 * waiting
 *   Waiting on the client or a third party to respond.
 *
 * resolved
 *   The issue has been addressed and is pending confirmation.
 *
 * closed
 *   The ticket is complete and retained for the record.
 */
export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "closed";
