/**
 * Operational statistics collected for an AI provider.
 *
 * These values are maintained by the AI Operations layer
 * and are used by the Director when making routing decisions.
 */
export interface ProviderStatistics {
  /**
   * Total requests executed.
   */
  requests: number;

  /**
   * Successful executions.
   */
  successes: number;

  /**
   * Failed executions.
   */
  failures: number;

  /**
   * Average response time in milliseconds.
   */
  averageResponseTime: number;

  /**
   * Average tokens consumed.
   */
  averageTokens: number;

  /**
   * Estimated accumulated cost.
   */
  estimatedCost: number;

  /**
   * Last successful execution timestamp.
   */
  lastUsed?: string;
}