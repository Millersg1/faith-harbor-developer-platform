import type { AIProvider } from "./AIProvider";
import type { AICapability } from "./Capability";

/**
 * Stores and retrieves AI providers available to Faith Harbor OS.
 *
 * The registry does not decide which provider should handle a request.
 * Provider selection and routing belong to a separate service.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  /**
   * Registers a new AI provider.
   *
   * Provider IDs must be unique and cannot be empty.
   */
  register(provider: AIProvider): void {
    const providerId = provider.id.trim();

    if (!providerId) {
      throw new Error("AI provider ID cannot be empty.");
    }

    if (this.providers.has(providerId)) {
      throw new Error(
        `AI provider "${providerId}" is already registered.`,
      );
    }

    this.providers.set(providerId, provider);
  }

  /**
   * Retrieves a provider by its unique ID.
   */
  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Returns every registered provider.
   */
  getAll(): readonly AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Returns every provider supporting the requested capability.
   */
  findByCapability(
    capability: AICapability,
  ): readonly AIProvider[] {
    return this.getAll().filter((provider) =>
      provider.capabilities.includes(capability),
    );
  }

  /**
   * Determines whether a provider is registered.
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Removes a provider from the registry.
   *
   * Returns true when a provider was removed.
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Returns the number of registered providers.
   */
  get size(): number {
    return this.providers.size;
  }

  /**
   * Removes every registered provider.
   *
   * Primarily useful for testing and controlled shutdown.
   */
  clear(): void {
    this.providers.clear();
  }
}