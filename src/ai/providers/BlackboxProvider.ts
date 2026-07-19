import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";

interface BlackboxChatResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
}

interface BlackboxErrorResponse {
  error?: {
    message?: string;
  };
  message?: string;
}

/**
 * Faith Harbor OS adapter for the Blackbox Inference API.
 */
export class BlackboxProvider implements AIProvider {
  readonly id = "blackbox";

  readonly name = "Blackbox AI";

  readonly capabilities: readonly AICapability[] = [
    "writing",
    "research",
  ];

  readonly metadata: ProviderMetadata = {
    vendor: "Blackbox AI",
    version: "1.0.0",
    models: [
      "blackboxai/openai/gpt-5.5",
    ],
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    website: "https://www.blackbox.ai",
    documentation:
      "https://docs.blackbox.ai/api-reference/chat",
  };

  constructor(
    private readonly apiKey: string,
    private readonly model =
      "blackboxai/openai/gpt-5.5",
    private readonly baseURL =
      "https://api.blackbox.ai",
  ) {}

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const response = await fetch(
      `${this.baseURL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: request.prompt,
            },
          ],
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const errorBody =
        (await response
          .json()
          .catch(() => ({}))) as BlackboxErrorResponse;

      const message =
        errorBody.error?.message ??
        errorBody.message ??
        `Blackbox request failed with status ${response.status}.`;

      throw new Error(message);
    }

    const result =
      (await response.json()) as BlackboxChatResponse;

    const content =
      result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Blackbox returned an empty response.",
      );
    }

    return {
      provider: this.id,
      capability: request.capability,
      content,
      model: result.model ?? this.model,
      tokensUsed: result.usage?.total_tokens,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}