/**
 * Configuration required to connect to Ollama.
 */
export interface OllamaConfiguration {
  /**
   * Base URL of the Ollama server.
   *
   * Defaults to the local Ollama installation.
   */
  baseURL?: string;

  /**
   * Default model.
   */
  model?: string;

  /**
   * Request timeout in milliseconds.
   */
  timeout?: number;
}