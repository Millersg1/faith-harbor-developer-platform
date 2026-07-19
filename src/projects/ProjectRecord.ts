import type { ProjectStatus } from "./ProjectStatus";

/**
 * Represents a project stored by Faith Harbor OS.
 */
export interface ProjectRecord {
  id: string;

  /**
   * Client that owns this project.
   */
  clientId: string;

  /**
   * Proposal that created this project.
   * Undefined when the project was created manually.
   */
  proposalId?: string;

  /**
   * Display name.
   */
  name: string;

  /**
   * Short description.
   */
  description?: string;

  /**
   * Current lifecycle state.
   */
  status: ProjectStatus;

  /**
   * Optional project dates.
   */
  startDate?: string;
  dueDate?: string;
  completedDate?: string;

  /**
   * Internal notes.
   */
  notes?: string;

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