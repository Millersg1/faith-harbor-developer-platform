import { describe, expect, it } from "vitest";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
} from "../../src/ai/AIProvider";
import type { AICapability } from "../../src/ai/Capability";
import { ProviderRegistry } from "../../src/ai/ProviderRegistry";

class TestProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AICapability[];

  constructor(
    id: string,
    capabilities: readonly AICapability[],
    name = "Test Provider",
  ) {
    this.id = id;
    this.name = name;
    this.capabilities = capabilities;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
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

describe("ProviderRegistry", () => {
  it("registers and retrieves a provider", () => {
    const registry = new ProviderRegistry();
    const provider = new TestProvider("test", ["writing"]);

    registry.register(provider);

    expect(registry.get("test")).toBe(provider);
    expect(registry.has("test")).toBe(true);
    expect(registry.size).toBe(1);
  });

  it("rejects an empty provider ID", () => {
    const registry = new ProviderRegistry();
    const provider = new TestProvider("   ", ["writing"]);

    expect(() => registry.register(provider)).toThrow(
      "AI provider ID cannot be empty.",
    );
  });

  it("rejects duplicate provider IDs", () => {
    const registry = new ProviderRegistry();
    const first = new TestProvider("duplicate", ["writing"]);
    const second = new TestProvider("duplicate", ["research"]);

    registry.register(first);

    expect(() => registry.register(second)).toThrow(
      'AI provider "duplicate" is already registered.',
    );
  });

  it("returns all registered providers", () => {
    const registry = new ProviderRegistry();
    const first = new TestProvider("first", ["writing"]);
    const second = new TestProvider("second", ["research"]);

    registry.register(first);
    registry.register(second);

    expect(registry.getAll()).toEqual([first, second]);
  });

  it("finds providers by capability", () => {
    const registry = new ProviderRegistry();

    const writingProvider = new TestProvider("writer", ["writing"]);
    const researchProvider = new TestProvider("researcher", ["research"]);
    const multiProvider = new TestProvider("multi", [
      "writing",
      "research",
    ]);

    registry.register(writingProvider);
    registry.register(researchProvider);
    registry.register(multiProvider);

    expect(registry.findByCapability("writing")).toEqual([
      writingProvider,
      multiProvider,
    ]);
  });

  it("unregisters a provider", () => {
    const registry = new ProviderRegistry();
    const provider = new TestProvider("test", ["writing"]);

    registry.register(provider);

    expect(registry.unregister("test")).toBe(true);
    expect(registry.has("test")).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("returns false when unregistering an unknown provider", () => {
    const registry = new ProviderRegistry();

    expect(registry.unregister("missing")).toBe(false);
  });

  it("clears all providers", () => {
    const registry = new ProviderRegistry();

    registry.register(new TestProvider("first", ["writing"]));
    registry.register(new TestProvider("second", ["research"]));

    registry.clear();

    expect(registry.getAll()).toEqual([]);
    expect(registry.size).toBe(0);
  });
});