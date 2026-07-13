/**
 * Configuration required to connect to the OpenRouter API.
 */
export interface OpenRouterConfiguration {
  /**
   * OpenRouter API key.
   */
  apiKey: string;

  /**
   * Optional custom API endpoint.
   *
   * Defaults to the official OpenRouter endpoint.
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

  /**
   * Optional HTTP Referer header.
   */
  referer?: string;

  /**
   * Optional application title.
   */
  title?: string;
}