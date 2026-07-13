import { AnthropicClientFactory } from "../config/AnthropicClientFactory";
import type { AnthropicConfiguration } from "../config/AnthropicConfiguration";
import { ProviderRegistry } from "../ProviderRegistry";
import { AnthropicProvider } from "../providers/AnthropicProvider";
import type { AIProviderInstaller } from "./AIProviderInstaller";

/**
 * Installs the Anthropic provider into the framework.
 */
export class AnthropicProviderInstaller
  implements AIProviderInstaller
{
  constructor(
    private readonly configuration: AnthropicConfiguration,
  ) {}

  install(
    registry: ProviderRegistry,
  ): void {
    const client = AnthropicClientFactory.create(
      this.configuration,
    );

    registry.register(
      new AnthropicProvider(client),
    );
  }
}