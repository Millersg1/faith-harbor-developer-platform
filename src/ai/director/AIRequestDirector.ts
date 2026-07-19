import { randomUUID } from "node:crypto";

import type {
  AIProvider,
  AIRequest,
} from "../AIProvider";
import type { ProviderAdvisor } from "../advisor/ProviderAdvisor";
import type { AIExecutionPlan } from "../execution/AIExecutionPlan";
import { ProviderRegistry } from "../ProviderRegistry";
import { AIDecisionLog } from "./AIDecisionLog";
import { ProviderSelectionPolicy } from "./ProviderSelectionPolicy";

interface ProviderSelection {
  provider: AIProvider;
  reason: string;
  confidence: number;
}

/**
 * Selects the most appropriate AI provider for a request.
 */
export class AIRequestDirector {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly policy =
      ProviderSelectionPolicy.FIRST_AVAILABLE,
    private readonly advisor?: ProviderAdvisor,
    private readonly decisionLog =
      new AIDecisionLog(),
  ) {}

  /**
   * Produces an execution plan.
   */
  plan(
    request: AIRequest,
  ): AIExecutionPlan {
    const selection =
      this.selectProvider(request);

    const model =
      selection.provider.metadata.models[0];

    this.decisionLog.record({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      capability: request.capability,
      providerId: selection.provider.id,
      providerName: selection.provider.name,
      reason: selection.reason,
      confidence: selection.confidence,
      model,
    });

    return {
      provider: selection.provider,
      model,
      reason: selection.reason,
      streaming:
        selection.provider.metadata
          .supportsStreaming,
    };
  }

  /**
   * Returns the Director's decision history.
   */
  getDecisionLog(): AIDecisionLog {
    return this.decisionLog;
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
        confidence: 100,
      };
    }

    return this.selectByPolicy(
      request,
      providers,
    );
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
    request: AIRequest,
    providers: readonly AIProvider[],
  ): ProviderSelection {
    switch (this.policy) {
      case ProviderSelectionPolicy.METRICS_DRIVEN: {
        if (!this.advisor) {
          throw new Error(
            "A provider advisor is required for metrics-driven selection.",
          );
        }

        const recommendation =
          this.advisor.recommend(request);

        return {
          provider:
            recommendation.provider,
          reason:
            recommendation.reason,
          confidence:
            recommendation.confidence,
        };
      }

      case ProviderSelectionPolicy.HIGHEST_PRIORITY:
        return {
          provider: providers[0],
          reason:
            "Highest priority provider.",
          confidence: 100,
        };

      case ProviderSelectionPolicy.FIRST_AVAILABLE:
      default:
        return {
          provider: providers[0],
          reason:
            "First available provider.",
          confidence: 100,
        };
    }
  }
}