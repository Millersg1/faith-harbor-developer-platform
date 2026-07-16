import type {
  AIProvider,
  AIRequest,
  AIResponse,
} from "./AIProvider";
import { DefaultProviderAdvisor } from "./advisor/DefaultProviderAdvisor";
import { AIDecisionLog } from "./director/AIDecisionLog";
import { AIRequestDirector } from "./director/AIRequestDirector";
import { ProviderSelectionPolicy } from "./director/ProviderSelectionPolicy";
import type { AIExecutionPlan } from "./execution/AIExecutionPlan";
import { ProviderMetricsRegistry } from "./metrics/ProviderMetricsRegistry";
import { ProviderRegistry } from "./ProviderRegistry";

/**
 * Coordinates AI request planning and execution.
 */
export class ProviderManager {
  private readonly director: AIRequestDirector;

  constructor(
    registry: ProviderRegistry,
    policy = ProviderSelectionPolicy.FIRST_AVAILABLE,
    private readonly metrics =
      new ProviderMetricsRegistry(),
    decisionLog = new AIDecisionLog(),
  ) {
    const advisor =
      new DefaultProviderAdvisor(
        registry,
        this.metrics,
      );

    this.director = new AIRequestDirector(
      registry,
      policy,
      advisor,
      decisionLog,
    );
  }

  /**
   * Creates an execution plan for a request.
   */
  plan(request: AIRequest): AIExecutionPlan {
    return this.director.plan(request);
  }

  /**
   * Selects the provider contained in the execution plan.
   *
   * This method preserves compatibility with existing callers.
   */
  select(request: AIRequest): AIProvider {
    return this.plan(request).provider;
  }

  /**
   * Returns the metrics registry used by this manager.
   */
  getMetricsRegistry(): ProviderMetricsRegistry {
    return this.metrics;
  }

  /**
   * Returns the Director's routing decision log.
   */
  getDecisionLog(): AIDecisionLog {
    return this.director.getDecisionLog();
  }

  /**
   * Executes a request and records operational metrics.
   */
  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const plan = this.plan(request);
    const provider = plan.provider;
    const startedAt = Date.now();

    if (!this.metrics.has(provider.id)) {
      this.metrics.register(
        provider.id,
        provider.name,
      );
    }

    try {
      const response =
        await provider.generate(request);

      this.metrics.recordExecution(
        provider.id,
        {
          success: true,
          responseTime:
            Date.now() - startedAt,
          tokensUsed: response.tokensUsed,
        },
      );

      return response;
    } catch (error) {
      this.metrics.recordExecution(
        provider.id,
        {
          success: false,
          responseTime:
            Date.now() - startedAt,
        },
      );

      throw error;
    }
  }
}