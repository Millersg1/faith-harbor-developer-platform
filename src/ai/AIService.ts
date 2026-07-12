import type {
  AIProvider,
  AIRequest,
  AIResponse,
} from "./AIProvider";
import { ProviderManager } from "./ProviderManager";
import { ProviderRegistry } from "./ProviderRegistry";

/**
 * Provides the public application-facing interface for AI operations.
 *
 * Other Faith Harbor OS modules should depend on this service instead
 * of directly selecting or invoking concrete AI providers.
 */
export class AIService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly manager: ProviderManager,
  ) {}

  /**
   * Registers an AI provider with the system.
   */
  registerProvider(provider: AIProvider): void {
    this.registry.register(provider);
  }

  /**
   * Removes an AI provider from the system.
   */
  unregisterProvider(providerId: string): boolean {
    return this.registry.unregister(providerId);
  }

  /**
   * Determines whether a provider is registered.
   */
  hasProvider(providerId: string): boolean {
    return this.registry.has(providerId);
  }

  /**
   * Returns all currently registered providers.
   */
  getProviders(): readonly AIProvider[] {
    return this.registry.getAll();
  }

  /**
   * Executes an AI request using the provider selected by the manager.
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    return this.manager.generate(request);
  }
}