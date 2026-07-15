import type { AIProvider } from "../AIProvider";
import type { AIRequest } from "../AIProvider";
import { ProviderRegistry } from "../ProviderRegistry";
import type { AIExecutionPlan } from "../execution/AIExecutionPlan";
import { ProviderSelectionPolicy } from "./ProviderSelectionPolicy";

/**
 * Selects the most appropriate AI provider for a request.
 */
export class AIRequestDirector {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly policy =
      ProviderSelectionPolicy.FIRST_AVAILABLE,
  ) {}

  /**
   * Produces an execution plan.
   */
  plan(
    request: AIRequest,
  ): AIExecutionPlan {
    const provider = this.selectProvider(request);

    return {
      provider,
      model: provider.metadata.models[0],
      reason: this.describeReason(),
      streaming:
        provider.metadata.supportsStreaming,
    };
  }

  /**
   * Internal provider selection.
   */
  private selectProvider(
    request: AIRequest,
  ): AIProvider {
    const providers =
      this.registry.findByCapability(
        request.capability,
      );

    if (providers.length === 0) {
      throw new Error(
        `No AI provider supports capability "${request.capability}".`,
      );
    }

    switch (this.policy) {
      case ProviderSelectionPolicy.FIRST_AVAILABLE:
        return providers[0];

      case ProviderSelectionPolicy.HIGHEST_PRIORITY:
        // Placeholder.
        return providers[0];

      default:
        return providers[0];
    }
  }

  /**
   * Explains why the provider was selected.
   */
  private describeReason(): string {
    switch (this.policy) {
      case ProviderSelectionPolicy.HIGHEST_PRIORITY:
        return "Highest priority provider.";

      case ProviderSelectionPolicy.FIRST_AVAILABLE:
      default:
        return "First available provider.";
    }
  }
}