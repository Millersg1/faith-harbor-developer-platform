/**
 * Information needed to generate a client proposal.
 */
export interface ProposalRequest {
  /**
   * Client or organization receiving the proposal.
   */
  clientName: string;

  /**
   * Service or outcome being proposed.
   */
  requestedOutcome: string;

  /**
   * Client requirements, problems, scope, and relevant context.
   */
  requirements: string;

  /**
   * Optional deadline or requested delivery date.
   */
  dueDate?: string;

  /**
   * Additional proposal context.
   */
  metadata?: Record<string, unknown>;
}