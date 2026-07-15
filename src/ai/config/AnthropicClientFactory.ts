import Anthropic from "@anthropic-ai/sdk";

import type { AnthropicConfiguration } from "./AnthropicConfiguration";

/**
 * Creates configured Anthropic SDK clients for Faith Harbor OS.
 */
export class AnthropicClientFactory {
  static create(
    configuration: AnthropicConfiguration,
  ): Anthropic {
    const apiKey = configuration.apiKey.trim();

    if (!apiKey) {
      throw new Error(
        "Anthropic API key cannot be empty.",
      );
    }

    return new Anthropic({
      apiKey,
      baseURL: configuration.baseURL,
      timeout: configuration.timeout,
      maxRetries: configuration.maxRetries,
    });
  }
}