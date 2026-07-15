import { AIService } from "../AIService";
import { OpenAIClientFactory } from "../config/OpenAIClientFactory";
import type { OpenAIConfiguration } from "../config/OpenAIConfiguration";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";
import { BlackboxProvider } from "../providers/BlackboxProvider";
import { OpenAIProvider } from "../providers/OpenAIProvider";

export class AIBootstrap {
  static create(
    configuration: OpenAIConfiguration,
    blackboxApiKey?: string,
  ): AIService {
    const registry = new ProviderRegistry();

    const client =
      OpenAIClientFactory.create(configuration);

    const openAIProvider =
      new OpenAIProvider(client);

    registry.register(openAIProvider);

    if (blackboxApiKey) {
      const blackboxProvider =
        new BlackboxProvider(blackboxApiKey);

      registry.register(blackboxProvider);
    }

    const manager =
      new ProviderManager(registry);

    return new AIService(
      registry,
      manager,
    );
  }
}