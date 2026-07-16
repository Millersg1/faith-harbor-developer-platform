import { AIService } from "../AIService";
import {
  AIDecisionLog,
  type DecisionLogDatabase,
} from "../director/AIDecisionLog";
import { ProviderSelectionPolicy } from "../director/ProviderSelectionPolicy";
import type { AIProviderInstaller } from "../installers/AIProviderInstaller";
import { ProviderMetricsRegistry } from "../metrics/ProviderMetricsRegistry";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";

export class AIBootstrap {
  /**
   * Creates a configured AIService and runs all provider installers.
   *
   * When a database connection is supplied, Director decisions
   * are loaded from and persisted to that database.
   */
  static async create(
    installers: readonly AIProviderInstaller[],
    database?: DecisionLogDatabase,
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
      new ProviderMetricsRegistry();

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