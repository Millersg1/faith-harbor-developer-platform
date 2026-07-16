import type { AIProvider } from "../AIProvider";

/**
 * Recommendation produced by a provider advisor.
 */
export interface ProviderRecommendation {
  /**
   * Recommended provider.
   */
  provider: AIProvider;

  /**
   * Confidence score from 0 through 100.
   */
  confidence: number;

  /**
   * Human-readable explanation for the recommendation.
   */
  reason: string;
}