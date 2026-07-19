import type { LeadStatus } from "./LeadStatus";

/**
 * Represents a sales lead tracked by Faith Harbor OS.
 */
export interface LeadRecord {
  id: string;

  /**
   * Existing client this lead relates to, if any.
   * Set when a lead is converted or already a client.
   */
  clientId?: string;

  /**
   * Contact name for the lead.
   */
  name: string;

  /**
   * Company or organization.
   */
  company?: string;

  email?: string;

  phone?: string;

  /**
   * Where the lead came from (referral, website, event...).
   */
  source?: string;

  /**
   * Marketing campaign that generated this lead, if any.
   */
  campaignId?: string;

  /**
   * Service the lead is interested in.
   */
  serviceInterest?: string;

  /**
   * Estimated deal value.
   */
  estimatedValue?: number;

  /**
   * Current pipeline stage.
   */
  status: LeadStatus;

  /**
   * Person responsible for the lead.
   */
  owner?: string;

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
