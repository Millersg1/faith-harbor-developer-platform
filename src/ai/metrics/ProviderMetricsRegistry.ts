import type { AIProviderScorecard } from "./AIProviderScorecard";
import type { ProviderStatistics } from "./ProviderStatistics";

/**
 * Result data used when recording one provider execution.
 */
export interface ProviderExecutionResult {
  success: boolean;
  responseTime: number;
  tokensUsed?: number;
  estimatedCost?: number;
  completedAt?: string;
}

/**
 * Stores operational metrics for registered AI providers.
 */
export class ProviderMetricsRegistry {
  private readonly scorecards =
    new Map<string, AIProviderScorecard>();

  /**
   * Creates an empty scorecard for a provider.
   */
  register(
    providerId: string,
    providerName: string,
  ): AIProviderScorecard {
    const existing =
      this.scorecards.get(providerId);

    if (existing) {
      return existing;
    }

    const statistics: ProviderStatistics = {
      requests: 0,
      successes: 0,
      failures: 0,
      averageResponseTime: 0,
      averageTokens: 0,
      estimatedCost: 0,
    };

    const scorecard: AIProviderScorecard = {
      providerId,
      providerName,
      statistics,
      reliabilityScore: 100,
      overallScore: 100,
    };

    this.scorecards.set(
      providerId,
      scorecard,
    );

    return scorecard;
  }

  /**
   * Records one completed provider execution.
   */
  recordExecution(
    providerId: string,
    result: ProviderExecutionResult,
  ): AIProviderScorecard {
    const scorecard =
      this.scorecards.get(providerId);

    if (!scorecard) {
      throw new Error(
        `Provider metrics are not registered for "${providerId}".`,
      );
    }

    const previousRequests =
      scorecard.statistics.requests;

    const requests = previousRequests + 1;
    const successes =
      scorecard.statistics.successes +
      (result.success ? 1 : 0);
    const failures =
      scorecard.statistics.failures +
      (result.success ? 0 : 1);

    const averageResponseTime =
      this.calculateAverage(
        scorecard.statistics.averageResponseTime,
        previousRequests,
        result.responseTime,
      );

    const averageTokens =
      result.tokensUsed === undefined
        ? scorecard.statistics.averageTokens
        : this.calculateAverage(
            scorecard.statistics.averageTokens,
            previousRequests,
            result.tokensUsed,
          );

    const estimatedCost =
      scorecard.statistics.estimatedCost +
      (result.estimatedCost ?? 0);

    const reliabilityScore =
      requests === 0
        ? 100
        : (successes / requests) * 100;

    const overallScore =
      this.calculateOverallScore(
        reliabilityScore,
        averageResponseTime,
        estimatedCost,
      );

    const updated: AIProviderScorecard = {
      ...scorecard,
      statistics: {
        requests,
        successes,
        failures,
        averageResponseTime,
        averageTokens,
        estimatedCost,
        lastUsed:
          result.completedAt ??
          new Date().toISOString(),
      },
      reliabilityScore,
      overallScore,
    };

    this.scorecards.set(
      providerId,
      updated,
    );

    return updated;
  }

  /**
   * Returns a provider scorecard.
   */
  get(
    providerId: string,
  ): AIProviderScorecard | undefined {
    return this.scorecards.get(providerId);
  }

  /**
   * Returns all provider scorecards.
   */
  getAll(): readonly AIProviderScorecard[] {
    return Array.from(
      this.scorecards.values(),
    );
  }

  /**
   * Returns whether a provider has a scorecard.
   */
  has(providerId: string): boolean {
    return this.scorecards.has(providerId);
  }

  /**
   * Removes a provider scorecard.
   */
  unregister(providerId: string): boolean {
    return this.scorecards.delete(providerId);
  }

  /**
   * Returns the number of registered scorecards.
   */
  get size(): number {
    return this.scorecards.size;
  }

  private calculateAverage(
    currentAverage: number,
    previousCount: number,
    newValue: number,
  ): number {
    const total =
      currentAverage * previousCount +
      newValue;

    return total / (previousCount + 1);
  }

  private calculateOverallScore(
    reliabilityScore: number,
    averageResponseTime: number,
    estimatedCost: number,
  ): number {
    const responsePenalty =
      Math.min(averageResponseTime / 100, 20);

    const costPenalty =
      Math.min(estimatedCost * 10, 20);

    return Math.max(
      0,
      Math.min(
        100,
        reliabilityScore -
          responsePenalty -
          costPenalty,
      ),
    );
  }
}