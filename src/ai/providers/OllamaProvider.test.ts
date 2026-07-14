import { describe, expect, it } from "vitest";

import { OllamaClientFactory } from "../config/OllamaClientFactory";
import { OllamaProvider } from "./OllamaProvider";

describe("OllamaProvider", () => {
  it("exposes the expected provider identity", () => {
    const provider = new OllamaProvider(
      OllamaClientFactory.create(),
    );

    expect(provider.id).toBe("ollama");
    expect(provider.name).toBe("Ollama");
  });

  it("exposes supported capabilities", () => {
    const provider = new OllamaProvider(
      OllamaClientFactory.create(),
    );

    expect(provider.capabilities).toEqual([
      "writing",
      "research",
    ]);
  });

  it("reports healthy status", async () => {
    const provider = new OllamaProvider(
      OllamaClientFactory.create(),
    );

    const health = await provider.health();

    expect(health.status).toBe("healthy");
  });

  it("returns a placeholder response", async () => {
    const provider = new OllamaProvider(
      OllamaClientFactory.create(),
    );

    const response = await provider.generate({
      capability: "writing",
      prompt: "Hello",
    });

    expect(response.provider).toBe("ollama");
    expect(response.model).toBe("llama3.2");
  });

  it("exposes provider metadata", () => {
    const provider = new OllamaProvider(
      OllamaClientFactory.create(),
    );

    expect(provider.metadata.vendor).toBe(
      "Ollama",
    );

    expect(
      provider.metadata.supportsStreaming,
    ).toBe(true);
  });
});