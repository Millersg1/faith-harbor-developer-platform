import { describe, expect, it } from "vitest";

import { AIService } from "./AIService";
import { ProviderManager } from "./ProviderManager";
import { ProviderRegistry } from "./ProviderRegistry";
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
  ProviderMetadata,
} from "./AIProvider";
import type { AICapability } from "./Capability";

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

describe("AIService", () => {
  it("registers providers", () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);
    const service = new AIService(registry, manager);

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    service.registerProvider(provider);

    expect(service.hasProvider("provider1")).toBe(true);
  });

  it("unregisters providers", () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);
    const service = new AIService(registry, manager);

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    service.registerProvider(provider);

    expect(
      service.unregisterProvider("provider1"),
    ).toBe(true);

    expect(service.hasProvider("provider1")).toBe(
      false,
    );
  });

  it("returns registered providers", () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);
    const service = new AIService(registry, manager);

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    service.registerProvider(provider);

    expect(service.getProviders()).toEqual([
      provider,
    ]);
  });

  it("creates an execution plan", () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);
    const service = new AIService(registry, manager);

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    service.registerProvider(provider);

    const plan = service.plan({
      capability: "writing",
      prompt: "Hello",
    });

    expect(plan.provider).toBe(provider);
    expect(plan.model).toBe("test-model");
    expect(plan.reason).toBe(
      "First available provider.",
    );
  });

  it("delegates generation to ProviderManager", async () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);
    const service = new AIService(registry, manager);

    const provider = new TestProvider(
      "provider1",
      ["writing"],
    );

    service.registerProvider(provider);

    const response = await service.generate({
      capability: "writing",
      prompt: "Hello",
    });

    expect(response.provider).toBe("provider1");
    // generate() grounds every prompt in the Faith Harbor
    // organizational context before dispatching it, so the
    // echoing TestProvider returns the grounded prompt.
    expect(response.content).toContain(
      "FAITH HARBOR ORGANIZATIONAL CONTEXT",
    );
    expect(response.content).toContain("Hello");
  });

  it("reports registered providers", () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);
    const service = new AIService(registry, manager);

    expect(service.getProviders()).toEqual([]);
  });
});