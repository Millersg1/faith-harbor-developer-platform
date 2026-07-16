import type {
  AIProvider,
  AIRequest,
} from "../AIProvider";
import { ProviderMetricsRegistry } from "../metrics/ProviderMetricsRegistry";
import { ProviderRegistry } from "../ProviderRegistry";
import type { ProviderAdvisor } from "./ProviderAdvisor";
import type { ProviderRecommendation } from "./ProviderRecommendation";

/**
 * Recommends the highest-scoring provider that supports
 * the requested capability.
 */
export class DefaultProviderAdvisor
  implements ProviderAdvisor
{
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly metrics:
      ProviderMetricsRegistry,
  ) {}

  recommend(
    request: AIRequest,
  ): ProviderRecommendation {
    const providers =
      this.registry.findByCapability(
        request.capability,
      );

    if (providers.length === 0) {
      throw new Error(
        `No AI provider supports capability "${request.capability}".`,
      );
    }

    const recommended =
      this.selectHighestScoringProvider(
        providers,
      );

    const scorecard =
      this.metrics.get(recommended.id);

    const confidence =
      scorecard?.overallScore ?? 100;

    return {
      provider: recommended,
      confidence,
      reason:
        scorecard
          ? `Provider "${recommended.name}" has the highest operational score of ${confidence}.`
          : `Provider "${recommended.name}" was selected because no operational history is available.`,
    };
  }

  private selectHighestScoringProvider(
    providers: readonly AIProvider[],
  ): AIProvider {
    return providers.reduce(
      (best, candidate) => {
        const bestScore =
          this.metrics.get(best.id)
            ?.overallScore ?? 100;

        const candidateScore =
          this.metrics.get(candidate.id)
            ?.overallScore ?? 100;

        return candidateScore > bestScore
          ? candidate
          : best;
      },
    );
  }
}