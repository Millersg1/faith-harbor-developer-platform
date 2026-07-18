import type { TicketPriority } from "./TicketPriority";
import type { TicketStatus } from "./TicketStatus";

/**
 * Represents a support ticket stored by Faith Harbor OS.
 */
export interface TicketRecord {
  id: string;

  /**
   * Human-readable ticket number (e.g. "TICKET-0001").
   */
  number: string;

  /**
   * Client that opened this ticket.
   */
  clientId: string;

  /**
   * Project this ticket relates to.
   * Undefined when the ticket is not tied to a project.
   */
  projectId?: string;

  /**
   * Short summary of the issue.
   */
  subject: string;

  /**
   * Full description of the issue.
   */
  description?: string;

  /**
   * Current lifecycle state.
   */
  status: TicketStatus;

  /**
   * Urgency of the ticket.
   */
  priority: TicketPriority;

  /**
   * Person responsible for the ticket.
   */
  assignee?: string;

  /**
   * How the ticket was resolved.
   */
  resolution?: string;

  /**
   * Date the ticket was resolved.
   */
  resolvedDate?: string;

  /**
   * Extensible metadata.
   */
  metadata?: Record<string, unknown>;

  /**
   * Audit timestamps.
   */
  createdAt: string;
  updatedAt: string;
}
