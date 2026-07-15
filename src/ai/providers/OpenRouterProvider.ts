import type OpenAI from "openai";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";

/**
 * Faith Harbor OS adapter for OpenRouter.
 *
 * This provider translates between the Faith Harbor AI framework
 * and the OpenRouter API through the OpenAI-compatible SDK.
 */
export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";

  readonly name = "OpenRouter";

  readonly capabilities: readonly AICapability[] = [
    "writing",
    "research",
  ];

  readonly metadata: ProviderMetadata = {
    vendor: "OpenRouter",
    version: "1.0.0",
    models: [
      "openai/gpt-5-mini",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-pro",
    ],
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    website: "https://openrouter.ai",
    documentation: "https://openrouter.ai/docs",
  };

  constructor(
    private readonly client: OpenAI,
    private readonly model = "openai/gpt-5-mini",
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "user",
          content: request.prompt,
        },
      ],
    });

    return {
      provider: this.id,
      capability: request.capability,
      content:
        response.choices[0]?.message.content ?? "",
      model: this.model,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}