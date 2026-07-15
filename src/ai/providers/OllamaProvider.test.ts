import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  OllamaClient,
} from "../config/OllamaClientFactory";
import { OllamaProvider } from "./OllamaProvider";

describe("OllamaProvider", () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = {
      baseURL: "http://localhost:11434",
      generate: vi.fn(),
      health: vi.fn(),
    };
  });

  it("exposes the expected provider identity", () => {
    const provider = new OllamaProvider(client);

    expect(provider.id).toBe("ollama");
    expect(provider.name).toBe("Ollama");
  });

  it("exposes supported capabilities", () => {
    const provider = new OllamaProvider(client);

    expect(provider.capabilities).toContain(
      "writing",
    );
    expect(provider.capabilities).toContain(
      "research",
    );
  });

  it("exposes provider metadata", () => {
    const provider = new OllamaProvider(client);

    expect(provider.metadata.vendor).toBe(
      "Ollama",
    );
    expect(provider.metadata.models).toEqual([
      "hermes3:latest",
      "gpt-oss:20b",
      "mistral:latest",
      "llama3.2:latest",
    ]);
    expect(
      provider.metadata.supportsStreaming,
    ).toBe(true);
    expect(
      provider.metadata.supportsVision,
    ).toBe(false);
    expect(
      provider.metadata.supportsTools,
    ).toBe(false);
  });

  it("reports healthy status", async () => {
    vi.mocked(client.health).mockResolvedValue(
      true,
    );

    const provider = new OllamaProvider(client);

    const result = await provider.health();

    expect(result.status).toBe("healthy");
    expect(result.checkedAt).toBeDefined();
  });

  it("reports offline status when Ollama is unavailable", async () => {
    vi.mocked(client.health).mockResolvedValue(
      false,
    );

    const provider = new OllamaProvider(client);

    const result = await provider.health();

    expect(result.status).toBe("offline");
    expect(result.checkedAt).toBeDefined();
  });

  it("generates through the Ollama client", async () => {
    vi.mocked(client.generate).mockResolvedValue(
      "Hello from Hermes.",
    );

    const provider = new OllamaProvider(client);

    const result = await provider.generate({
      capability: "writing",
      prompt: "Hello",
    });

    expect(client.generate).toHaveBeenCalledWith(
      "hermes3:latest",
      "Hello",
    );

    expect(result).toEqual({
      provider: "ollama",
      capability: "writing",
      content: "Hello from Hermes.",
      model: "hermes3:latest",
    });
  });
});