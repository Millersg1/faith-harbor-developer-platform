import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "./OpenAIProvider";

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: "test-api-key",
  });
}

describe("OpenAIProvider", () => {
  it("exposes the expected provider identity", () => {
    const provider = new OpenAIProvider(createClient());

    expect(provider.id).toBe("openai");
    expect(provider.name).toBe("OpenAI");
  });

  it("exposes supported capabilities", () => {
    const provider = new OpenAIProvider(createClient());

    expect(provider.capabilities).toEqual([
      "writing",
      "research",
    ]);
  });

  it("exposes provider metadata", () => {
    const provider = new OpenAIProvider(createClient());

    expect(provider.metadata).toEqual({
      vendor: "OpenAI",
      version: "1.0.0",
      models: [
        "gpt-5.5",
        "gpt-5.4",
        "gpt-5-mini",
      ],
      supportsStreaming: true,
      supportsVision: true,
      supportsTools: true,
      website: "https://openai.com",
      documentation: "https://developers.openai.com",
    });
  });

  it("reports healthy status", async () => {
    const provider = new OpenAIProvider(createClient());

    const health = await provider.health();

    expect(health.status).toBe("healthy");
    expect(new Date(health.checkedAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("generates a response through the OpenAI client", async () => {
    const client = createClient();

    vi.spyOn(client.responses, "create").mockResolvedValue({
      output_text: "Hello from OpenAI",
    } as never);

    const provider = new OpenAIProvider(client, "gpt-5-mini");

    const response = await provider.generate({
      capability: "writing",
      prompt: "Write a greeting",
    });

    expect(client.responses.create).toHaveBeenCalledWith({
      model: "gpt-5-mini",
      input: "Write a greeting",
    });

    expect(response).toEqual({
      provider: "openai",
      capability: "writing",
      content: "Hello from OpenAI",
      model: "gpt-5-mini",
    });
  });

  it("captures token usage when the API reports it", async () => {
    const client = createClient();

    vi.spyOn(
      client.responses,
      "create",
    ).mockResolvedValue({
      output_text: "Hello",
      usage: {
        input_tokens: 120,
        output_tokens: 45,
        total_tokens: 165,
      },
    } as never);

    const provider = new OpenAIProvider(
      client,
      "gpt-5.5",
    );

    const response =
      await provider.generate({
        capability: "writing",
        prompt: "Hi",
      });

    expect(response.inputTokens)
      .toBe(120);
    expect(response.outputTokens)
      .toBe(45);
    expect(response.tokensUsed)
      .toBe(165);
  });
});