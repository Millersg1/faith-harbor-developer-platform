import type { OpenAIConfiguration } from "../config/OpenAIConfiguration";
import { OpenAIClientFactory } from "../config/OpenAIClientFactory";
import { ProviderRegistry } from "../ProviderRegistry";
import { OpenAIProvider } from "../providers/OpenAIProvider";
import type { AIProviderInstaller } from "./AIProviderInstaller";

/**
 * Installs the OpenAI provider into the framework.
 */
export class OpenAIProviderInstaller
  implements AIProviderInstaller
{
  constructor(
    private readonly configuration: OpenAIConfiguration,
  ) {}

  install(
    registry: ProviderRegistry,
  ): void {
    const client = OpenAIClientFactory.create(
      this.configuration,
    );

    registry.register(
      new OpenAIProvider(client),
    );
  }
}