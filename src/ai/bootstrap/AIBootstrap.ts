import { AIService } from "../AIService";
import type { AIProviderInstaller } from "../installers/AIProviderInstaller";
import { ProviderMetricsRegistry } from "../metrics/ProviderMetricsRegistry";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";

export class AIBootstrap {
  /**
   * Creates a configured AIService and runs all provider installers.
   */
  static async create(
    installers: readonly AIProviderInstaller[],
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

    const manager = new ProviderManager(
      registry,
      undefined,
      metrics,
    );

    return new AIService(
      registry,
      manager,
    );
  }
}