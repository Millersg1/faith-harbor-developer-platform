import type { AIProviderScorecard } from "./AIProviderScorecard";
import type { ProviderScoringPolicy } from "./ProviderScoringPolicy";

/**
 * Default scoring policy used by the AI Director.
 */
export class DefaultProviderScoringPolicy
  implements ProviderScoringPolicy
{
  score(
    scorecard: AIProviderScorecard,
  ): number {
    const responsePenalty =
      Math.min(
        scorecard.statistics.averageResponseTime /
          100,
        20,
      );

    const costPenalty =
      Math.min(
        scorecard.statistics.estimatedCost * 10,
        20,
      );

    return Math.max(
      0,
      Math.min(
        100,
        scorecard.reliabilityScore -
          responsePenalty -
          costPenalty,
      ),
    );
  }
}