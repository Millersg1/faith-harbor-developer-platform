import type { ProgramStatus } from "./ProgramStatus";

/**
 * Represents the information required to record a ministry program.
 */
export interface ProgramRequest {
  /**
   * Optional church or client the program serves.
   */
  clientId?: string;

  name: string;

  category?: string;

  /**
   * Defaults to "planned" when omitted.
   */
  status?: ProgramStatus;

  leader?: string;

  schedule?: string;

  participants?: number;

  startDate?: string;

  endDate?: string;

  description?: string;

  notes?: string;

  metadata?: Record<string, unknown>;
}
