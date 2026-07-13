import { AIService } from "../AIService";
import { AnthropicClientFactory } from "../config/AnthropicClientFactory";
import { OpenAIClientFactory } from "../config/OpenAIClientFactory";
import { ProviderManager } from "../ProviderManager";
import { ProviderRegistry } from "../ProviderRegistry";
import { AnthropicProvider } from "../providers/AnthropicProvider";
import { OpenAIProvider } from "../providers/OpenAIProvider";
import type { AIBootstrapConfiguration } from "./AIBootstrapConfiguration";

/**
 * Bootstraps the Faith Harbor AI framework.
 */
export class AIBootstrap {
  /**
   * Creates a configured AIService and registers all enabled providers.
   */
  static create(
    configuration: AIBootstrapConfiguration,
  ): AIService {
    const registry = new ProviderRegistry();

    if (configuration.openai) {
      const client = OpenAIClientFactory.create(
        configuration.openai,
      );

      registry.register(new OpenAIProvider(client));
    }

    if (configuration.anthropic) {
      const client = AnthropicClientFactory.create(
        configuration.anthropic,
      );

      registry.register(new AnthropicProvider(client));
    }

    if (registry.size === 0) {
      throw new Error(
        "At least one AI provider configuration is required.",
      );
    }

    const manager = new ProviderManager(registry);

    return new AIService(registry, manager);
  }
}