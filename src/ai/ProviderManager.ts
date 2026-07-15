import type {
  AIProvider,
  AIRequest,
  AIResponse,
} from "./AIProvider";
import { AIRequestDirector } from "./director/AIRequestDirector";
import { ProviderSelectionPolicy } from "./director/ProviderSelectionPolicy";
import type { AIExecutionPlan } from "./execution/AIExecutionPlan";
import { ProviderRegistry } from "./ProviderRegistry";

/**
 * Coordinates AI request planning and execution.
 */
export class ProviderManager {
  private readonly director: AIRequestDirector;

  constructor(
    registry: ProviderRegistry,
    policy = ProviderSelectionPolicy.FIRST_AVAILABLE,
  ) {
    this.director = new AIRequestDirector(
      registry,
      policy,
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
   * Executes a request using the generated execution plan.
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const plan = this.plan(request);

    return plan.provider.generate(request);
  }
}