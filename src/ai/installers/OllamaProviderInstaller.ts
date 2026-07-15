import { OllamaClientFactory } from "../config/OllamaClientFactory";
import type { OllamaConfiguration } from "../config/OllamaConfiguration";
import { ProviderRegistry } from "../ProviderRegistry";
import { OllamaProvider } from "../providers/OllamaProvider";
import type { AIProviderInstaller } from "./AIProviderInstaller";

/**
 * Installs the Ollama provider into the framework.
 */
export class OllamaProviderInstaller
  implements AIProviderInstaller
{
  constructor(
    private readonly configuration: OllamaConfiguration = {},
  ) {}

  install(
    registry: ProviderRegistry,
  ): void {
    const client = OllamaClientFactory.create(
      this.configuration,
    );

    registry.register(
      new OllamaProvider(
        client,
        this.configuration.model ??
          "hermes3:latest",
      ),
    );
  }
}