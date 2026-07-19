/**
 * Determines how AI providers are selected.
 */
export enum ProviderSelectionPolicy {
  /**
   * Select the first matching provider.
   */
  FIRST_AVAILABLE = "first-available",

  /**
   * Select the provider with the highest priority.
   */
  HIGHEST_PRIORITY = "highest-priority",

  /**
   * Select the provider recommended by operational metrics.
   */
  METRICS_DRIVEN = "metrics-driven",
}