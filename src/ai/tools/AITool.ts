/**
 * Input supplied to an AI tool.
 */
export interface AIToolInput {
  /**
   * Tool-specific arguments.
   */
  arguments: Record<string, unknown>;

  /**
   * Optional runtime session identifier.
   */
  sessionId?: string;

  /**
   * Optional worker identifier.
   */
  workerId?: string;

  /**
   * Additional execution context.
   */
  context?: Record<string, unknown>;
}

/**
 * Result returned by an AI tool.
 */
export interface AIToolResult {
  /**
   * Whether the tool completed successfully.
   */
  success: boolean;

  /**
   * Human-readable result content.
   */
  content: string;

  /**
   * Optional structured output.
   */
  data?: Record<string, unknown>;

  /**
   * Optional error details.
   */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Governed capability exposed to AI workers.
 */
export interface AITool {
  /**
   * Unique tool identifier.
   */
  readonly id: string;

  /**
   * Human-readable tool name.
   */
  readonly name: string;

  /**
   * Description presented to workers and the runtime.
   */
  readonly description: string;

  /**
   * Executes the tool.
   */
  execute(
    input: AIToolInput,
  ): Promise<AIToolResult>;
}