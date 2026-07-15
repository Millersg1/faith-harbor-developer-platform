import { describe, expect, it } from "vitest";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "../AIProvider";
import type { AICapability } from "../Capability";
import { ProviderRegistry } from "../ProviderRegistry";
import { AIRequestDirector } from "./AIRequestDirector";
import { ProviderSelectionPolicy } from "./ProviderSelectionPolicy";

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

describe("AIRequestDirector", () => {
  it("creates a plan with the first matching provider", () => {
    const registry = new ProviderRegistry();

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

    const director = new AIRequestDirector(
      registry,
      ProviderSelectionPolicy.FIRST_AVAILABLE,
    );

    const plan = director.plan({
      capability: "writing",
      prompt: "Hello",
    });

    expect(plan.provider).toBe(first);
    expect(plan.model).toBe("test-model");
    expect(plan.reason).toBe(
      "First available provider.",
    );
    expect(plan.streaming).toBe(false);
  });

  it("throws when no provider supports the capability", () => {
    const director = new AIRequestDirector(
      new ProviderRegistry(),
    );

    expect(() =>
      director.plan({
        capability: "research",
        prompt: "Hello",
      }),
    ).toThrow(
      'No AI provider supports capability "research".',
    );
  });

  it("creates a highest-priority execution plan", () => {
    const registry = new ProviderRegistry();

    const provider = new TestProvider(
      "writer",
      ["writing"],
    );

    registry.register(provider);

    const director = new AIRequestDirector(
      registry,
      ProviderSelectionPolicy.HIGHEST_PRIORITY,
    );

    const plan = director.plan({
      capability: "writing",
      prompt: "Hello",
    });

    expect(plan.provider).toBe(provider);
    expect(plan.model).toBe("test-model");
    expect(plan.reason).toBe(
      "Highest priority provider.",
    );
    expect(plan.streaming).toBe(false);
  });
});