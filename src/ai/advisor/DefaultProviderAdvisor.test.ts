import { describe, expect, it } from "vitest";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";
import { ProviderMetricsRegistry } from "../metrics/ProviderMetricsRegistry";
import { ProviderRegistry } from "../ProviderRegistry";
import { DefaultProviderAdvisor } from "./DefaultProviderAdvisor";

class TestProvider implements AIProvider {
  readonly name: string;

  readonly metadata: ProviderMetadata = {
    vendor: "Faith Harbor",
    version: "1.0.0",
    models: ["test-model"],
    supportsStreaming: false,
    supportsVision: false,
    supportsTools: false,
    website: "https://example.com",
    documentation: "https://example.com/docs",
  };

  constructor(
    readonly id: string,
    readonly capabilities: readonly AICapability[],
  ) {
    this.name = id;
  }

  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    return {
      provider: this.id,
      capability: request.capability,
      content: request.prompt,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}

describe("DefaultProviderAdvisor", () => {
  it("recommends the highest-scoring provider", () => {
    const registry = new ProviderRegistry();
    const metrics = new ProviderMetricsRegistry();

    const openAI = new TestProvider(
      "openai",
      ["writing"],
    );

    const ollama = new TestProvider(
      "ollama",
      ["writing"],
    );

    registry.register(openAI);
    registry.register(ollama);

    metrics.register(
      openAI.id,
      openAI.name,
    );

    metrics.register(
      ollama.id,
      ollama.name,
    );

    metrics.recordExecution(
      openAI.id,
      {
        success: false,
        responseTime: 500,
      },
    );

    metrics.recordExecution(
      ollama.id,
      {
        success: true,
        responseTime: 100,
      },
    );

    const advisor =
      new DefaultProviderAdvisor(
        registry,
        metrics,
      );

    const recommendation =
      advisor.recommend({
        capability: "writing",
        prompt: "Hello",
      });

    expect(
      recommendation.provider,
    ).toBe(ollama);

    expect(
      recommendation.confidence,
    ).toBeGreaterThan(0);

    expect(
      recommendation.reason,
    ).toContain(
      'Provider "ollama" has the highest operational score',
    );
  });

  it("uses the first provider when scores are equal", () => {
    const registry = new ProviderRegistry();
    const metrics = new ProviderMetricsRegistry();

    const first = new TestProvider(
      "first",
      ["writing"],
    );

    const second = new TestProvider(
      "second",
      ["writing"],
    );

    registry.register(first);
    registry.register(second);

    metrics.register(
      first.id,
      first.name,
    );

    metrics.register(
      second.id,
      second.name,
    );

    const advisor =
      new DefaultProviderAdvisor(
        registry,
        metrics,
      );

    const recommendation =
      advisor.recommend({
        capability: "writing",
        prompt: "Hello",
      });

    expect(
      recommendation.provider,
    ).toBe(first);

    expect(
      recommendation.confidence,
    ).toBe(100);
  });

  it("uses a provider without operational history", () => {
    const registry = new ProviderRegistry();
    const metrics = new ProviderMetricsRegistry();

    const provider = new TestProvider(
      "new-provider",
      ["writing"],
    );

    registry.register(provider);

    const advisor =
      new DefaultProviderAdvisor(
        registry,
        metrics,
      );

    const recommendation =
      advisor.recommend({
        capability: "writing",
        prompt: "Hello",
      });

    expect(
      recommendation.provider,
    ).toBe(provider);

    expect(
      recommendation.confidence,
    ).toBe(100);

    expect(
      recommendation.reason,
    ).toBe(
      'Provider "new-provider" was selected because no operational history is available.',
    );
  });

  it("ignores providers without the requested capability", () => {
    const registry = new ProviderRegistry();
    const metrics = new ProviderMetricsRegistry();

    const writer = new TestProvider(
      "writer",
      ["writing"],
    );

    const researcher = new TestProvider(
      "researcher",
      ["research"],
    );

    registry.register(writer);
    registry.register(researcher);

    metrics.register(
      writer.id,
      writer.name,
    );

    metrics.register(
      researcher.id,
      researcher.name,
    );

    const advisor =
      new DefaultProviderAdvisor(
        registry,
        metrics,
      );

    const recommendation =
      advisor.recommend({
        capability: "writing",
        prompt: "Hello",
      });

    expect(
      recommendation.provider,
    ).toBe(writer);
  });

  it("throws when no provider supports the capability", () => {
    const advisor =
      new DefaultProviderAdvisor(
        new ProviderRegistry(),
        new ProviderMetricsRegistry(),
      );

    expect(() =>
      advisor.recommend({
        capability: "research",
        prompt: "Hello",
      }),
    ).toThrow(
      'No AI provider supports capability "research".',
    );
  });
});