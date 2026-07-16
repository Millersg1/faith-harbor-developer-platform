/**
 * Records one AI routing decision made by the Director.
 */
export interface AIDecisionRecord {
  /**
   * Unique identifier.
   */
  id: string;

  /**
   * Time the decision was made.
   */
  timestamp: string;

  /**
   * Requested AI capability.
   */
  capability: string;

  /**
   * Selected provider.
   */
  providerId: string;

  /**
   * Human-readable provider name.
   */
  providerName: string;

  /**
   * Explanation for the decision.
   */
  reason: string;

  /**
   * Advisor confidence.
   */
  confidence: number;

  /**
   * Model selected.
   */
  model: string;
}