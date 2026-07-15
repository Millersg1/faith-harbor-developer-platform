import { ProviderRegistry } from "../ProviderRegistry";

/**
 * Installs one or more AI providers into the framework.
 */
export interface AIProviderInstaller {
  /**
   * Registers supported providers.
   */
  install(
    registry: ProviderRegistry,
  ): void | Promise<void>;
}