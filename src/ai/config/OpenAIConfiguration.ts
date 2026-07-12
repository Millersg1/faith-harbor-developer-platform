/**
 * Configuration required to connect to the OpenAI API.
 */
export interface OpenAIConfiguration {
  /**
   * OpenAI API key.
   */
  apiKey: string;

  /**
   * Optional OpenAI organization ID.
   */
  organization?: string;

  /**
   * Optional OpenAI project ID.
   */
  project?: string;

  /**
   * Optional custom API endpoint.
   */
  baseURL?: string;

  /**
   * Request timeout in milliseconds.
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts.
   */
  maxRetries?: number;
}