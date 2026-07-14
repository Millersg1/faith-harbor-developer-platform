import type { OllamaConfiguration } from "./OllamaConfiguration";

/**
 * Minimal client used by the Ollama provider.
 */
export interface OllamaClient {
  baseURL: string;
  timeout?: number;
}

/**
 * Creates configured Ollama clients.
 */
export class OllamaClientFactory {
  static create(
    configuration: OllamaConfiguration = {},
  ): OllamaClient {
    return {
      baseURL:
        configuration.baseURL ??
        "http://localhost:11434",
      timeout: configuration.timeout,
    };
  }
}