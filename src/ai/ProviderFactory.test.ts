import { describe, expect, it } from "vitest";

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  ProviderHealth,
} from "./AIProvider";
import type { AICapability } from "./Capability";
import {
  ProviderFactory,
  type ProviderOptions,
} from "./ProviderFactory";

class TestProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AICapability[];

  readonly metadata = {
    vendor: "Faith Harbor Test",
    version: "1.0.0",
    models: ["test-model"],
    supportsStreaming: false,
    supportsVision: false,
    supportsTools: false,
  } as const;

  constructor(
    id: string,
    name: string,
    capabilities: readonly AICapability[],
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

describe("ProviderFactory", () => {
  it("registers and creates a provider", () => {
    const factory = new ProviderFactory();

    factory.register("test", () => {
      return new TestProvider("test-1", "Test Provider", ["writing"]);
    });

    const provider = factory.create("test");

    expect(provider.id).toBe("test-1");
    expect(provider.name).toBe("Test Provider");
    expect(factory.has("test")).toBe(true);
    expect(factory.size).toBe(1);
  });

  it("passes options to the provider creator", () => {
    const factory = new ProviderFactory();

    factory.register(
      "configured",
      (options?: ProviderOptions) => {
        const id = String(options?.id ?? "default");
        const name = String(options?.name ?? "Configured Provider");

        return new TestProvider(id, name, ["research"]);
      },
    );

    const provider = factory.create("configured", {
      id: "custom-provider",
      name: "Custom Provider",
    });

    expect(provider.id).toBe("custom-provider");
    expect(provider.name).toBe("Custom Provider");
  });

  it("rejects an empty provider type", () => {
    const factory = new ProviderFactory();

    expect(() =>
      factory.register("   ", () => {
        return new TestProvider("test", "Test", ["writing"]);
      }),
    ).toThrow("AI provider type cannot be empty.");
  });

  it("rejects duplicate provider types", () => {
    const factory = new ProviderFactory();

    factory.register("test", () => {
      return new TestProvider("first", "First", ["writing"]);
    });

    expect(() =>
      factory.register("test", () => {
        return new TestProvider("second", "Second", ["research"]);
      }),
    ).toThrow(
      'AI provider type "test" is already registered.',
    );
  });

  it("throws when creating an unregistered provider type", () => {
    const factory = new ProviderFactory();

    expect(() => factory.create("missing")).toThrow(
      'AI provider type "missing" is not registered.',
    );
  });

  it("returns all registered provider types", () => {
    const factory = new ProviderFactory();

    factory.register("first", () => {
      return new TestProvider("first", "First", ["writing"]);
    });

    factory.register("second", () => {
      return new TestProvider("second", "Second", ["research"]);
    });

    expect(factory.getTypes()).toEqual(["first", "second"]);
  });

  it("unregisters a provider type", () => {
    const factory = new ProviderFactory();

    factory.register("test", () => {
      return new TestProvider("test", "Test", ["writing"]);
    });

    expect(factory.unregister("test")).toBe(true);
    expect(factory.has("test")).toBe(false);
    expect(factory.size).toBe(0);
  });

  it("returns false when unregistering an unknown type", () => {
    const factory = new ProviderFactory();

    expect(factory.unregister("missing")).toBe(false);
  });

  it("clears all registered provider types", () => {
    const factory = new ProviderFactory();

    factory.register("first", () => {
      return new TestProvider("first", "First", ["writing"]);
    });

    factory.register("second", () => {
      return new TestProvider("second", "Second", ["research"]);
    });

    factory.clear();

    expect(factory.getTypes()).toEqual([]);
    expect(factory.size).toBe(0);
  });
});