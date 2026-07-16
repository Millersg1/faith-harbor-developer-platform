import { AIService } from "../AIService";
import {
  AIDecisionLog,
  type DecisionLogDatabase,
} from "../director/AIDecisionLog";
import { ProviderSelectionPolicy } from "../director/ProviderSelectionPolicy";
import type { AIProviderInstaller } from "../installers/AIProviderInstaller";
import { DefaultProviderScoringPolicy } from "../metrics/DefaultProviderScoringPolicy";
import {
  ProviderMetricsRegistry,
  type ProviderMetricsDatabase,
} from "../metrics/ProviderMetricsRegistry";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";

export interface AIOperationsDatabase
  extends DecisionLogDatabase,
    ProviderMetricsDatabase {}

/**
 * Creates the configured AI operations environment.
 */
export class AIBootstrap {
  /**
   * Installs providers and creates the AI service.
   *
   * When a database connection is supplied, provider metrics
   * and Director decisions are loaded and persisted.
   */
  static async create(
    installers: readonly AIProviderInstaller[],
    database?: AIOperationsDatabase,
  ): Promise<AIService> {
    const registry = new ProviderRegistry();

    for (const installer of installers) {
      await installer.install(registry);
    }

    if (registry.size === 0) {
      throw new Error(
        "At least one AI provider installer is required.",
      );
    }

    const metrics =
      new ProviderMetricsRegistry(
        new DefaultProviderScoringPolicy(),
        database,
      );

    for (const provider of registry.getAll()) {
      metrics.register(
        provider.id,
        provider.name,
      );
    }

    const decisionLog =
      new AIDecisionLog(database);

    const manager = new ProviderManager(
      registry,
      ProviderSelectionPolicy.METRICS_DRIVEN,
      metrics,
      decisionLog,
    );

    return new AIService(
      registry,
      manager,
    );
  }
}