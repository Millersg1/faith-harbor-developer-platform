import { describe, expect, it, vi } from "vitest";

import type { OllamaClient } from "../config/OllamaClientFactory";
import { OllamaProvider } from "./OllamaProvider";

function createClient(): OllamaClient {
  return {
    baseURL: "http://localhost:11434",

    generate: vi.fn().mockResolvedValue(
      "Faith Harbor local response",
    ),

    health: vi.fn().mockResolvedValue(true),
  };
}

describe("OllamaProvider", () => {
  it("exposes the expected provider identity", () => {
    const provider = new OllamaProvider(createClient());

    expect(provider.id).toBe("ollama");
    expect(provider.name).toBe("Ollama");
  });

  it("exposes supported capabilities", () => {
    const provider = new OllamaProvider(createClient());

    expect(provider.capabilities).toEqual([
      "writing",
      "research",
    ]);
  });

  it("exposes provider metadata", () => {
    const provider = new OllamaProvider(createClient());

    expect(provider.metadata.vendor).toBe("Ollama");
    expect(provider.metadata.models).toEqual([
      "gpt-oss:20b",
      "mistral:latest",
      "llama3.2:latest",
    ]);
    expect(provider.metadata.supportsStreaming).toBe(true);
    expect(provider.metadata.supportsVision).toBe(false);
    expect(provider.metadata.supportsTools).toBe(false);
  });

  it("reports healthy status", async () => {
    const client = createClient();
    const provider = new OllamaProvider(client);

    const health = await provider.health();

    expect(client.health).toHaveBeenCalled();
    expect(health.status).toBe("healthy");
    expect(new Date(health.checkedAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("reports offline status when Ollama is unavailable", async () => {
    const client = createClient();

    vi.mocked(client.health).mockResolvedValue(false);

    const provider = new OllamaProvider(client);

    const health = await provider.health();

    expect(health.status).toBe("offline");
  });

  it("generates through the Ollama client", async () => {
    const client = createClient();

    const provider = new OllamaProvider(
      client,
      "llama3.2:latest",
    );

    const response = await provider.generate({
      capability: "writing",
      prompt: "Write a greeting",
    });

    expect(client.generate).toHaveBeenCalledWith(
      "llama3.2:latest",
      "Write a greeting",
    );

    expect(response).toEqual({
      provider: "ollama",
      capability: "writing",
      content: "Faith Harbor local response",
      model: "llama3.2:latest",
    });
  });
});