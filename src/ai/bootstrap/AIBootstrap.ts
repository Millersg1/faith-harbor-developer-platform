import { AIService } from "../AIService";
import { OpenAIClientFactory } from "../config/OpenAIClientFactory";
import type { OpenAIConfiguration } from "../config/OpenAIConfiguration";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";
import { OpenAIProvider } from "../providers/OpenAIProvider";

/**
 * Bootstraps the Faith Harbor AI framework.
 */
export class AIBootstrap {
  /**
   * Creates a fully configured AIService.
   */
  static create(
    configuration: OpenAIConfiguration,
  ): AIService {
    const registry = new ProviderRegistry();

    const client =
      OpenAIClientFactory.create(configuration);

    const provider =
      new OpenAIProvider(client);

    registry.register(provider);

    const manager =
      new ProviderManager(registry);

    return new AIService(
      registry,
      manager,
    );
  }
}