import type { AIProvider } from "./AIProvider";

export type ProviderOptions = Readonly<Record<string, unknown>>;

export type ProviderCreator = (
  options?: ProviderOptions,
) => AIProvider;

/**
 * Creates AI providers through registered provider creators.
 *
 * The factory centralizes provider construction so other parts of
 * Faith Harbor OS do not instantiate concrete providers directly.
 */
export class ProviderFactory {
  private readonly creators = new Map<string, ProviderCreator>();

  /**
   * Registers a creator for a provider type.
   */
  register(type: string, creator: ProviderCreator): void {
    const providerType = type.trim();

    if (!providerType) {
      throw new Error("AI provider type cannot be empty.");
    }

    if (this.creators.has(providerType)) {
      throw new Error(
        `AI provider type "${providerType}" is already registered.`,
      );
    }

    this.creators.set(providerType, creator);
  }

  /**
   * Creates a provider of the requested type.
   */
  create(
    type: string,
    options?: ProviderOptions,
  ): AIProvider {
    const providerType = type.trim();
    const creator = this.creators.get(providerType);

    if (!creator) {
      throw new Error(
        `AI provider type "${providerType}" is not registered.`,
      );
    }

    return creator(options);
  }

  /**
   * Determines whether a provider type is registered.
   */
  has(type: string): boolean {
    return this.creators.has(type.trim());
  }

  /**
   * Removes a registered provider creator.
   */
  unregister(type: string): boolean {
    return this.creators.delete(type.trim());
  }

  /**
   * Returns every registered provider type.
   */
  getTypes(): readonly string[] {
    return Array.from(this.creators.keys());
  }

  /**
   * Returns the number of registered provider types.
   */
  get size(): number {
    return this.creators.size;
  }

  /**
   * Removes all registered provider creators.
   */
  clear(): void {
    this.creators.clear();
  }
}