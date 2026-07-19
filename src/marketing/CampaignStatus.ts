/**
 * Represents the lifecycle of a marketing campaign.
 *
 * planned
 *   Campaign is being prepared and has not launched.
 *
 * active
 *   Campaign is currently running.
 *
 * paused
 *   Campaign is temporarily stopped.
 *
 * completed
 *   Campaign has finished and is retained for the record.
 */
export type CampaignStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed";
