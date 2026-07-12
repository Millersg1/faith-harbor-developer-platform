import { describe, expect, it } from "vitest";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
} from "./AIProvider";
import type { AICapability } from "./Capability";
import { AIService } from "./AIService";
import { ProviderManager } from "./ProviderManager";
import { ProviderRegistry } from "./ProviderRegistry";

class TestProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AICapability[];

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
      content: `Response from ${this.id}: ${request.prompt}`,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}

function createService(): AIService {
  const registry = new ProviderRegistry();
  const manager = new ProviderManager(registry);

  return new AIService(registry, manager);
}

describe("AIService", () => {
  it("registers and retrieves providers", () => {
    const service = createService();
    const provider = new TestProvider("writer", ["writing"]);

    service.registerProvider(provider);

    expect(service.hasProvider("writer")).toBe(true);
    expect(service.getProviders()).toEqual([provider]);
  });

  it("unregisters a provider", () => {
    const service = createService();
    const provider = new TestProvider("writer", ["writing"]);

    service.registerProvider(provider);

    expect(service.unregisterProvider("writer")).toBe(true);
    expect(service.hasProvider("writer")).toBe(false);
  });

  it("returns false when unregistering an unknown provider", () => {
    const service = createService();

    expect(service.unregisterProvider("missing")).toBe(false);
  });

  it("generates a response through the selected provider", async () => {
    const service = createService();
    const provider = new TestProvider("writer", ["writing"]);

    service.registerProvider(provider);

    const response = await service.generate({
      capability: "writing",
      prompt: "Write a greeting",
    });

    expect(response.provider).toBe("writer");
    expect(response.content).toBe(
      "Response from writer: Write a greeting",
    );
  });

  it("throws when no provider supports the requested capability", async () => {
    const service = createService();

    await expect(
      service.generate({
        capability: "research",
        prompt: "Find information",
      }),
    ).rejects.toThrow(
      'No AI provider supports capability "research".',
    );
  });
});