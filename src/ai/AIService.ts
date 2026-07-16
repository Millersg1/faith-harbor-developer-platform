import type {
  AIProvider,
  AIRequest,
  AIResponse,
} from "./AIProvider";
import type { AIExecutionPlan } from "./execution/AIExecutionPlan";
import type { AIProviderScorecard } from "./metrics/AIProviderScorecard";
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

    this.manager
      .getMetricsRegistry()
      .register(
        provider.id,
        provider.name,
      );
  }

  /**
   * Removes an AI provider from the system.
   */
  unregisterProvider(providerId: string): boolean {
    const removed =
      this.registry.unregister(providerId);

    if (removed) {
      this.manager
        .getMetricsRegistry()
        .unregister(providerId);
    }

    return removed;
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
   * Returns all AI provider operational scorecards.
   */
  getProviderScorecards():
    readonly AIProviderScorecard[] {
    return this.manager
      .getMetricsRegistry()
      .getAll();
  }

  /**
   * Returns one provider operational scorecard.
   */
  getProviderScorecard(
    providerId: string,
  ): AIProviderScorecard | undefined {
    return this.manager
      .getMetricsRegistry()
      .get(providerId);
  }

  /**
   * Creates an execution plan without running the request.
   */
  plan(request: AIRequest): AIExecutionPlan {
    return this.manager.plan(request);
  }

  /**
   * Executes an AI request using the generated execution plan.
   */
  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    return this.manager.generate(request);
  }
}