import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { OpenRouterProvider } from "./OpenRouterProvider";

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: "test-api-key",
    baseURL: "https://openrouter.ai/api/v1",
  });
}

describe("OpenRouterProvider", () => {
  it("exposes the expected provider identity", () => {
    const provider = new OpenRouterProvider(createClient());

    expect(provider.id).toBe("openrouter");
    expect(provider.name).toBe("OpenRouter");
  });

  it("exposes supported capabilities", () => {
    const provider = new OpenRouterProvider(createClient());

    expect(provider.capabilities).toEqual([
      "writing",
      "research",
    ]);
  });

  it("exposes provider metadata", () => {
    const provider = new OpenRouterProvider(createClient());

    expect(provider.metadata.vendor).toBe("OpenRouter");
    expect(provider.metadata.supportsStreaming).toBe(true);
    expect(provider.metadata.supportsVision).toBe(true);
    expect(provider.metadata.supportsTools).toBe(true);
  });

  it("reports healthy status", async () => {
    const provider = new OpenRouterProvider(createClient());

    const health = await provider.health();

    expect(health.status).toBe("healthy");
    expect(new Date(health.checkedAt).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("generates through the OpenRouter client", async () => {
    const client = createClient();

    vi.spyOn(
      client.chat.completions,
      "create",
    ).mockResolvedValue({
      choices: [
        {
          message: {
            content: "Hello from OpenRouter",
          },
        },
      ],
    } as never);

    const provider = new OpenRouterProvider(
      client,
      "openai/gpt-5-mini",
    );

    const response = await provider.generate({
      capability: "writing",
      prompt: "Write a greeting",
    });

    expect(client.chat.completions.create).toHaveBeenCalledWith({
      model: "openai/gpt-5-mini",
      messages: [
        {
          role: "user",
          content: "Write a greeting",
        },
      ],
    });

    expect(response).toEqual({
      provider: "openrouter",
      capability: "writing",
      content: "Hello from OpenRouter",
      model: "openai/gpt-5-mini",
    });
  });

  it("returns empty content when the response has no message text", async () => {
    const client = createClient();

    vi.spyOn(
      client.chat.completions,
      "create",
    ).mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
          },
        },
      ],
    } as never);

    const provider = new OpenRouterProvider(client);

    const response = await provider.generate({
      capability: "research",
      prompt: "Research a topic",
    });

    expect(response.content).toBe("");
  });
});