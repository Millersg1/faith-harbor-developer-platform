import type { AIProviderScorecard } from "./AIProviderScorecard";
import { DefaultProviderScoringPolicy } from "./DefaultProviderScoringPolicy";
import type { ProviderScoringPolicy } from "./ProviderScoringPolicy";
import type { ProviderStatistics } from "./ProviderStatistics";

interface DatabaseStatement {
  all(...parameters: unknown[]): unknown[];
  run(...parameters: unknown[]): unknown;
}

export interface ProviderMetricsDatabase {
  prepare(sql: string): DatabaseStatement;
}

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
 *
 * When a database connection is supplied, existing scorecards
 * are loaded at startup and updates are persisted automatically.
 */
export class ProviderMetricsRegistry {
  private readonly scorecards =
    new Map<string, AIProviderScorecard>();

  constructor(
    private readonly scoringPolicy:
      ProviderScoringPolicy =
      new DefaultProviderScoringPolicy(),
    private readonly database?:
      ProviderMetricsDatabase,
  ) {
    this.loadPersistedScorecards();
  }

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

    const initialScorecard: AIProviderScorecard = {
      providerId,
      providerName,
      statistics,
      reliabilityScore: 100,
      overallScore: 100,
    };

    const scorecard: AIProviderScorecard = {
      ...initialScorecard,
      overallScore:
        this.scoringPolicy.score(
          initialScorecard,
        ),
    };

    this.scorecards.set(
      providerId,
      scorecard,
    );

    this.persistScorecard(scorecard);

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
      (successes / requests) * 100;

    const updatedWithoutScore:
      AIProviderScorecard = {
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
        overallScore: scorecard.overallScore,
      };

    const updated: AIProviderScorecard = {
      ...updatedWithoutScore,
      overallScore:
        this.scoringPolicy.score(
          updatedWithoutScore,
        ),
    };

    this.scorecards.set(
      providerId,
      updated,
    );

    this.persistScorecard(updated);

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
    const removed =
      this.scorecards.delete(providerId);

    if (removed) {
      this.database
        ?.prepare(`
          DELETE FROM ai_provider_metrics
          WHERE provider_id = ?
        `)
        .run(providerId);
    }

    return removed;
  }

  /**
   * Returns the number of registered scorecards.
   */
  get size(): number {
    return this.scorecards.size;
  }

  /**
   * Loads previously persisted scorecards from SQLite.
   */
  private loadPersistedScorecards(): void {
    if (!this.database) {
      return;
    }

    const rows = this.database
      .prepare(`
        SELECT
          provider_id,
          provider_name,
          requests,
          successes,
          failures,
          average_response_time,
          average_tokens,
          estimated_cost,
          last_used,
          reliability_score,
          overall_score
        FROM ai_provider_metrics
        ORDER BY provider_id ASC
      `)
      .all() as Array<{
        provider_id: string;
        provider_name: string;
        requests: number;
        successes: number;
        failures: number;
        average_response_time: number;
        average_tokens: number;
        estimated_cost: number;
        last_used: string | null;
        reliability_score: number;
        overall_score: number;
      }>;

    for (const row of rows) {
      const statistics: ProviderStatistics = {
        requests: row.requests,
        successes: row.successes,
        failures: row.failures,
        averageResponseTime:
          row.average_response_time,
        averageTokens:
          row.average_tokens,
        estimatedCost:
          row.estimated_cost,
      };

      if (row.last_used) {
        statistics.lastUsed =
          row.last_used;
      }

      this.scorecards.set(
        row.provider_id,
        {
          providerId: row.provider_id,
          providerName: row.provider_name,
          statistics,
          reliabilityScore:
            row.reliability_score,
          overallScore:
            row.overall_score,
        },
      );
    }
  }

  /**
   * Inserts or updates one provider scorecard in SQLite.
   */
  private persistScorecard(
    scorecard: AIProviderScorecard,
  ): void {
    if (!this.database) {
      return;
    }

    this.database
      .prepare(`
        INSERT INTO ai_provider_metrics (
          provider_id,
          provider_name,
          requests,
          successes,
          failures,
          average_response_time,
          average_tokens,
          estimated_cost,
          last_used,
          reliability_score,
          overall_score,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          provider_name = excluded.provider_name,
          requests = excluded.requests,
          successes = excluded.successes,
          failures = excluded.failures,
          average_response_time =
            excluded.average_response_time,
          average_tokens =
            excluded.average_tokens,
          estimated_cost =
            excluded.estimated_cost,
          last_used = excluded.last_used,
          reliability_score =
            excluded.reliability_score,
          overall_score =
            excluded.overall_score,
          updated_at = excluded.updated_at
      `)
      .run(
        scorecard.providerId,
        scorecard.providerName,
        scorecard.statistics.requests,
        scorecard.statistics.successes,
        scorecard.statistics.failures,
        scorecard.statistics
          .averageResponseTime,
        scorecard.statistics.averageTokens,
        scorecard.statistics.estimatedCost,
        scorecard.statistics.lastUsed ?? null,
        scorecard.reliabilityScore,
        scorecard.overallScore,
        new Date().toISOString(),
      );
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
}