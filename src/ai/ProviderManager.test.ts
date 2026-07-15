import { describe, expect, it } from "vitest";

import { ProviderManager } from "./ProviderManager";
import { ProviderRegistry } from "./ProviderRegistry";
import { ProviderSelectionPolicy } from "./director/ProviderSelectionPolicy";
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "./AIProvider";
import type { AICapability } from "./Capability";

class TestProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AICapability[];

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
    id: string,
    capabilities: readonly AICapability[],
  ) {
    this.id = id;
    this.name = id;
    this.capabilities = capabilities;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    return {
      provider: this.id,
      capability: request.capability,
      content: `Response from ${this.id}`,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}

describe("ProviderManager", () => {
  it("selects the first provider supporting a capability", () => {
    const registry = new ProviderRegistry();

    const provider1 = new TestProvider(
      "provider1",
      ["writing"],
    );

    const provider2 = new TestProvider(
      "provider2",
      ["writing"],
    );

    registry.register(provider1);
    registry.register(provider2);

    const manager = new ProviderManager(registry);

    const provider = manager.select({
      capability: "writing",
      prompt: "Hello",
    });

    expect(provider).toBe(provider1);
  });

  it("throws when no provider supports the capability", () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);

    expect(() =>
      manager.select({
        capability: "writing",
        prompt: "Hello",
      }),
    ).toThrow(
      'No AI provider supports capability "writing".',
    );
  });

  it("delegates generate() to the selected provider", async () => {
    const registry = new ProviderRegistry();

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    registry.register(provider);

    const manager = new ProviderManager(registry);

    const response = await manager.generate({
      capability: "writing",
      prompt: "Generate text",
    });

    expect(response.provider).toBe("provider1");
    expect(response.content).toBe(
      "Response from provider1",
    );
  });

  it("creates an execution plan", () => {
    const registry = new ProviderRegistry();

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    registry.register(provider);

    const manager = new ProviderManager(registry);

    const plan = manager.plan({
      capability: "writing",
      prompt: "Create a plan",
    });

    expect(plan.provider).toBe(provider);
    expect(plan.model).toBe("test-model");
    expect(plan.reason).toBe(
      "First available provider.",
    );
    expect(plan.streaming).toBe(false);
  });

  it("forwards the selection policy to the director", () => {
    const registry = new ProviderRegistry();

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    registry.register(provider);

    const manager = new ProviderManager(
      registry,
      ProviderSelectionPolicy.HIGHEST_PRIORITY,
    );

    const plan = manager.plan({
      capability: "writing",
      prompt: "Create a plan",
    });

    expect(plan.provider).toBe(provider);
    expect(plan.reason).toBe(
      "Highest priority provider.",
    );
  });
});