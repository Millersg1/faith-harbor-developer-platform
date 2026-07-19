import type { CampaignStatus } from "./CampaignStatus";

/**
 * Represents the information required to record a campaign.
 */
export interface CampaignRequest {
  /**
   * Optional client this campaign is run for.
   */
  clientId?: string;

  name: string;

  channel?: string;

  /**
   * Defaults to "planned" when omitted.
   */
  status?: CampaignStatus;

  audience?: string;

  budget?: number;

  spend?: number;

  leads?: number;

  startDate?: string;

  endDate?: string;

  owner?: string;

  notes?: string;

  metadata?: Record<string, unknown>;
}
