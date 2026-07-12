import { describe, expect, it } from "vitest";

import { OpenAIProvider } from "./OpenAIProvider";

describe("OpenAIProvider", () => {
  it("exposes the expected provider identity", () => {
    const provider = new OpenAIProvider({});

    expect(provider.id).toBe("openai");
    expect(provider.name).toBe("OpenAI");
  });

  it("exposes supported capabilities", () => {
    const provider = new OpenAIProvider({});

    expect(provider.capabilities).toEqual([
      "writing",
      "research",
    ]);
  });

  it("exposes provider metadata", () => {
    const provider = new OpenAIProvider({});

    expect(provider.metadata).toEqual({
      vendor: "OpenAI",
      version: "1.0.0",
      models: [
        "gpt-5",
        "gpt-5-mini",
        "gpt-4.1",
      ],
      supportsStreaming: true,
      supportsVision: true,
      supportsTools: true,
      website: "https://openai.com",
      documentation: "https://platform.openai.com/docs",
    });
  });

  it("reports healthy status", async () => {
    const provider = new OpenAIProvider({});

    const health = await provider.health();

    expect(health.status).toBe("healthy");
    expect(new Date(health.checkedAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("throws until generation is implemented", async () => {
    const provider = new OpenAIProvider({});

    await expect(
      provider.generate({
        capability: "writing",
        prompt: "Write a greeting",
      }),
    ).rejects.toThrow(
      "OpenAIProvider.generate() is not implemented yet.",
    );
  });
});