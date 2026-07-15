import { ProviderRegistry } from "../ProviderRegistry";
import { BlackboxProvider } from "../providers/BlackboxProvider";
import type { AIProviderInstaller } from "./AIProviderInstaller";

/**
 * Installs the Blackbox AI provider into the framework.
 */
export class BlackboxProviderInstaller
  implements AIProviderInstaller
{
  constructor(
    private readonly apiKey: string,
  ) {}

  install(
    registry: ProviderRegistry,
  ): void {
    registry.register(
      new BlackboxProvider(this.apiKey),
    );
  }
}