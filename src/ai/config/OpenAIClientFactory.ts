import OpenAI from "openai";

import type { OpenAIConfiguration } from "./OpenAIConfiguration";

/**
 * Creates configured OpenAI SDK clients for Faith Harbor OS.
 */
export class OpenAIClientFactory {
  static create(
    configuration: OpenAIConfiguration,
  ): OpenAI {
    const apiKey = configuration.apiKey.trim();

    if (!apiKey) {
      throw new Error("OpenAI API key cannot be empty.");
    }

    return new OpenAI({
      apiKey,
      organization: configuration.organization,
      project: configuration.project,
      baseURL: configuration.baseURL,
      timeout: configuration.timeout,
      maxRetries: configuration.maxRetries,
    });
  }
}