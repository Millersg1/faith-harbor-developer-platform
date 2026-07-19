import type { LeadStatus } from "./LeadStatus";

/**
 * Represents the information required to record a sales lead.
 */
export interface LeadRequest {
  /**
   * Optional existing client this lead relates to.
   */
  clientId?: string;

  name: string;

  company?: string;

  email?: string;

  phone?: string;

  source?: string;

  /**
   * Marketing campaign that generated this lead, if any.
   */
  campaignId?: string;

  serviceInterest?: string;

  estimatedValue?: number;

  /**
   * Defaults to "new" when omitted.
   */
  status?: LeadStatus;

  owner?: string;

  notes?: string;

  metadata?: Record<string, unknown>;
}
