import type { DepartmentName } from "../domain/departments";

/**
 * A request for work submitted on behalf of a client.
 */
export interface ClientWorkRequest {
  /**
   * Unique client-facing request identifier.
   */
  id: string;

  /**
   * Client or organization requesting the work.
   */
  clientName: string;

  /**
   * Plain-language description of the desired result.
   */
  requestedOutcome: string;

  /**
   * Department responsible for the work.
   */
  department: DepartmentName;

  /**
   * Human owner accountable for the request.
   */
  owner: string;

  /**
   * Whether human approval is required before completion.
   */
  requiresApproval: boolean;

  /**
   * Optional requested completion date in ISO format.
   */
  dueDate?: string;

  /**
   * Additional client or project context.
   */
  metadata?: Record<string, unknown>;
}