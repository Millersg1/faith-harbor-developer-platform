import type { OllamaConfiguration } from "./OllamaConfiguration";

/**
 * Minimal client used by the Ollama provider.
 */
export interface OllamaClient {
  baseURL: string;
  timeout?: number;

  generate(
    model: string,
    prompt: string,
  ): Promise<string>;

  health(): Promise<boolean>;
}

/**
 * Creates configured Ollama clients.
 */
export class OllamaClientFactory {
  static create(
    configuration: OllamaConfiguration = {},
  ): OllamaClient {
    const baseURL =
      configuration.baseURL ??
      "http://localhost:11434";

    return {
      baseURL,
      timeout: configuration.timeout,

      async generate(
        model: string,
        prompt: string,
      ): Promise<string> {
        const controller = new AbortController();

        const timeoutId =
          configuration.timeout !== undefined
            ? setTimeout(
                () => controller.abort(),
                configuration.timeout,
              )
            : undefined;

        try {
          const response = await fetch(
            `${baseURL}/api/generate`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                prompt,
                stream: false,
              }),
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            throw new Error(
              `Ollama request failed with status ${response.status}.`,
            );
          }

          const data = await response.json() as {
            response?: string;
          };

          return data.response ?? "";
        } finally {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
        }
      },

      async health(): Promise<boolean> {
        try {
          const response = await fetch(
            `${baseURL}/api/tags`,
          );

          return response.ok;
        } catch {
          return false;
        }
      },
    };
  }
}