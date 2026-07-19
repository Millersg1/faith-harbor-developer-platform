import type { AIProviderScorecard } from "./AIProviderScorecard";

/**
 * Calculates an overall score for an AI provider.
 */
export interface ProviderScoringPolicy {
  /**
   * Returns a score from 0 through 100.
   */
  score(
    scorecard: AIProviderScorecard,
  ): number;
}