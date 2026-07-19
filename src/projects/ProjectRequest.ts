import type { ProjectStatus } from "./ProjectStatus";

/**
 * Represents the information required to create a project.
 */
export interface ProjectRequest {
  clientId: string;

  /**
   * Optional proposal that originated the project.
   */
  proposalId?: string;

  name: string;

  description?: string;

  /**
   * Defaults to "planned" when omitted.
   */
  status?: ProjectStatus;

  startDate?: string;
  dueDate?: string;
  completedDate?: string;

  notes?: string;

  metadata?: Record<string, unknown>;
}