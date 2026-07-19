import type { AIProvider } from "../AIProvider";

/**
 * Describes how an AI request should be executed.
 */
export interface AIExecutionPlan {
  /**
   * The selected provider.
   */
  provider: AIProvider;

  /**
   * Model selected for execution.
   */
  model?: string;

  /**
   * Human-readable explanation of why this
   * provider was selected.
   */
  reason: string;

  /**
   * Optional fallback provider.
   */
  fallbackProvider?: AIProvider;

  /**
   * Whether streaming should be used.
   */
  streaming: boolean;
}