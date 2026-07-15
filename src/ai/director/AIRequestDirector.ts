import type {
  AIProvider,
  AIRequest,
} from "../AIProvider";
import type { AIExecutionPlan } from "../execution/AIExecutionPlan";
import { ProviderRegistry } from "../ProviderRegistry";
import { ProviderSelectionPolicy } from "./ProviderSelectionPolicy";

interface ProviderSelection {
  provider: AIProvider;
  reason: string;
}

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
    const selection =
      this.selectProvider(request);

    return {
      provider: selection.provider,
      model:
        selection.provider.metadata.models[0],
      reason: selection.reason,
      streaming:
        selection.provider.metadata
          .supportsStreaming,
    };
  }

  /**
   * Selects either the provider explicitly requested
   * by the caller or one chosen by policy.
   */
  private selectProvider(
    request: AIRequest,
  ): ProviderSelection {
    const providers =
      this.registry.findByCapability(
        request.capability,
      );

    if (providers.length === 0) {
      throw new Error(
        `No AI provider supports capability "${request.capability}".`,
      );
    }

    const requestedProvider =
      this.getRequestedProvider(request);

    if (
      requestedProvider &&
      requestedProvider !== "auto"
    ) {
      const provider = providers.find(
        (candidate) =>
          candidate.id.toLowerCase() ===
            requestedProvider ||
          candidate.name.toLowerCase() ===
            requestedProvider,
      );

      if (!provider) {
        throw new Error(
          `Requested AI provider "${requestedProvider}" is not available for capability "${request.capability}".`,
        );
      }

      return {
        provider,
        reason:
          `Provider "${provider.name}" was explicitly selected.`,
      };
    }

    return this.selectByPolicy(providers);
  }

  /**
   * Reads and normalizes the provider requested by
   * the HTTP route or another caller.
   */
  private getRequestedProvider(
    request: AIRequest,
  ): string | undefined {
    const value =
      request.context?.requestedProvider;

    if (typeof value !== "string") {
      return undefined;
    }

    const normalized =
      value.trim().toLowerCase();

    return normalized || undefined;
  }

  /**
   * Selects a provider using the configured automatic
   * selection policy.
   */
  private selectByPolicy(
    providers: readonly AIProvider[],
  ): ProviderSelection {
    switch (this.policy) {
      case ProviderSelectionPolicy.HIGHEST_PRIORITY:
        return {
          provider: providers[0],
          reason:
            "Highest priority provider.",
        };

      case ProviderSelectionPolicy.FIRST_AVAILABLE:
      default:
        return {
          provider: providers[0],
          reason:
            "First available provider.",
        };
    }
  }
}