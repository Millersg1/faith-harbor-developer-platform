import type { TicketPriority } from "./TicketPriority";
import type { TicketStatus } from "./TicketStatus";

/**
 * Represents the information required to open a support ticket.
 */
export interface TicketRequest {
  clientId: string;

  /**
   * Optional project this ticket relates to.
   */
  projectId?: string;

  /**
   * Optional ticket number. Generated when omitted.
   */
  number?: string;

  subject: string;

  description?: string;

  /**
   * Defaults to "open" when omitted.
   */
  status?: TicketStatus;

  /**
   * Defaults to "medium" when omitted.
   */
  priority?: TicketPriority;

  assignee?: string;

  resolution?: string;

  resolvedDate?: string;

  metadata?: Record<string, unknown>;
}
