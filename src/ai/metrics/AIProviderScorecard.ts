import type { ProviderStatistics } from "./ProviderStatistics";

/**
 * Operational scorecard for one AI provider.
 *
 * The scorecard combines provider identity with the
 * statistics used for routing and reporting.
 */
export interface AIProviderScorecard {
  /**
   * Provider identifier, such as "openai" or "ollama".
   */
  providerId: string;

  /**
   * Human-readable provider name.
   */
  providerName: string;

  /**
   * Current operational statistics.
   */
  statistics: ProviderStatistics;

  /**
   * Reliability percentage from 0 through 100.
   */
  reliabilityScore: number;

  /**
   * Overall provider score from 0 through 100.
   */
  overallScore: number;
}