import OpenAI from "openai";

import type { OpenRouterConfiguration } from "./OpenRouterConfiguration";

/**
 * Creates configured OpenRouter SDK clients for Faith Harbor OS.
 */
export class OpenRouterClientFactory {
  static create(
    configuration: OpenRouterConfiguration,
  ): OpenAI {
    const apiKey = configuration.apiKey.trim();

    if (!apiKey) {
      throw new Error(
        "OpenRouter API key cannot be empty.",
      );
    }

    return new OpenAI({
      apiKey,
      baseURL:
        configuration.baseURL ??
        "https://openrouter.ai/api/v1",
      timeout: configuration.timeout,
      maxRetries: configuration.maxRetries,
      defaultHeaders: {
        ...(configuration.referer
          ? {
              "HTTP-Referer":
                configuration.referer,
            }
          : {}),
        ...(configuration.title
          ? {
              "X-Title":
                configuration.title,
            }
          : {}),
      },
    });
  }
}