import type OpenAI from "openai";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";
import { sumTokens } from "./tokenUsage";

/**
 * Faith Harbor OS adapter for OpenAI.
 *
 * This provider translates between the Faith Harbor AI framework
 * and the OpenAI Responses API.
 */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai";

  readonly name = "OpenAI";

  readonly capabilities: readonly AICapability[] = [
    "writing",
    "research",
  ];

  readonly metadata: ProviderMetadata = {
    vendor: "OpenAI",
    version: "1.0.0",
    models: [
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5-mini",
    ],
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    website: "https://openai.com",
    documentation: "https://developers.openai.com",
  };

  constructor(
    private readonly client: OpenAI,
    private readonly model = "gpt-5.5",
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const response = await this.client.responses.create({
      model: this.model,
      input: request.prompt,
    });

    const inputTokens =
      response.usage?.input_tokens;

    const outputTokens =
      response.usage?.output_tokens;

    return {
      provider: this.id,
      capability: request.capability,
      content: response.output_text,
      model: this.model,
      inputTokens,
      outputTokens,
      tokensUsed:
        response.usage?.total_tokens ??
        sumTokens(
          inputTokens,
          outputTokens,
        ),
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}