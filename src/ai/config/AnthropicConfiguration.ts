/**
 * Configuration required to connect to the Anthropic API.
 */
export interface AnthropicConfiguration {
  /**
   * Anthropic API key.
   */
  apiKey: string;

  /**
   * Optional custom API endpoint.
   */
  baseURL?: string;

  /**
   * Request timeout in milliseconds.
   */
  timeout?: number;

  /**
   * Maximum retry attempts.
   */
  maxRetries?: number;
}