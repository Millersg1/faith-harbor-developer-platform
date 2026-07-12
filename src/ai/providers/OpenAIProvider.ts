import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";

/**
 * Faith Harbor OS adapter for OpenAI.
 *
 * This provider translates between the Faith Harbor AI framework
 * and an injected OpenAI-compatible client.
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
      "gpt-5",
      "gpt-5-mini",
      "gpt-4.1",
    ],
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    website: "https://openai.com",
    documentation: "https://platform.openai.com/docs",
  };

  constructor(
    private readonly client: unknown,
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    void this.client;
    void request;

    throw new Error(
      "OpenAIProvider.generate() is not implemented yet.",
    );
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}