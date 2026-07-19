import type { ProgramStatus } from "./ProgramStatus";

/**
 * Represents a ministry program tracked by Faith Harbor OS.
 */
export interface ProgramRecord {
  id: string;

  /**
   * Church or client the program serves, if any.
   */
  clientId?: string;

  /**
   * Program name.
   */
  name: string;

  /**
   * Category (for example "Grief Support", "Outreach", "Prayer").
   */
  category?: string;

  /**
   * Current lifecycle state.
   */
  status: ProgramStatus;

  /**
   * Program leader or coordinator.
   */
  leader?: string;

  /**
   * Meeting schedule or cadence.
   */
  schedule?: string;

  /**
   * Number of participants.
   */
  participants?: number;

  /**
   * Program dates.
   */
  startDate?: string;
  endDate?: string;

  /**
   * Program description.
   */
  description?: string;

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
