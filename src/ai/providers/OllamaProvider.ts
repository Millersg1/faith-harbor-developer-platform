import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";
import type {
  OllamaClient,
} from "../config/OllamaClientFactory";

/**
 * Faith Harbor OS adapter for Ollama.
 */
export class OllamaProvider implements AIProvider {
  readonly id = "ollama";

  readonly name = "Ollama";

  readonly capabilities: readonly AICapability[] = [
    "writing",
    "research",
  ];

  readonly metadata: ProviderMetadata = {
    vendor: "Ollama",
    version: "1.0.0",
    models: [
      "llama3.2",
      "mistral",
      "phi3",
    ],
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: false,
    website: "https://ollama.com",
    documentation: "https://ollama.com/docs",
  };

  constructor(
    private readonly client: OllamaClient,
    private readonly model = "llama3.2",
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    // HTTP integration will be implemented later.
    // For now we verify the provider architecture.

    return {
      provider: this.id,
      capability: request.capability,
      content:
        "Ollama provider not yet connected.",
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