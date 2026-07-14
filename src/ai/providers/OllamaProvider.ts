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
      "gpt-oss:20b",
      "mistral:latest",
      "llama3.2:latest",
    ],
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: false,
    website: "https://ollama.com",
    documentation: "https://docs.ollama.com",
  };

  constructor(
    private readonly client: OllamaClient,
    private readonly model = "llama3.2:latest",
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const content = await this.client.generate(
      this.model,
      request.prompt,
    );

    return {
      provider: this.id,
      capability: request.capability,
      content,
      model: this.model,
    };
  }

  async health(): Promise<ProviderHealth> {
    const healthy = await this.client.health();

    return {
      status: healthy ? "healthy" : "offline",
      checkedAt: new Date().toISOString(),
    };
  }
}