import Anthropic from "@anthropic-ai/sdk";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";

/**
 * Faith Harbor OS adapter for Anthropic.
 *
 * This provider translates between the Faith Harbor AI framework
 * and the Anthropic Messages API.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";

  readonly name = "Anthropic";

  readonly capabilities: readonly AICapability[] = [
    "writing",
    "research",
  ];

  readonly metadata: ProviderMetadata = {
    vendor: "Anthropic",
    version: "1.0.0",
    models: [
      "claude-opus-4-1",
      "claude-sonnet-4",
      "claude-haiku-3-5",
    ],
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    website: "https://anthropic.com",
    documentation: "https://docs.anthropic.com",
  };

  constructor(
    private readonly client: Anthropic,
    private readonly model = "claude-sonnet-4",
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: request.prompt,
        },
      ],
    });

    const content =
      response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("");

    return {
      provider: this.id,
      capability: request.capability,
      content,
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