import { AIService } from "../AIService";
import type { AIProviderInstaller } from "../installers/AIProviderInstaller";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";

/**
 * Bootstraps the Faith Harbor AI framework.
 */
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

    const manager = new ProviderManager(registry);

    return new AIService(registry, manager);
  }
}