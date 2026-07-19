import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { AnthropicProvider } from "./AnthropicProvider";

function createClient(): Anthropic {
  return new Anthropic({
    apiKey: "test-api-key",
  });
}

describe("AnthropicProvider", () => {
  it("exposes the expected provider identity", () => {
    const provider = new AnthropicProvider(createClient());

    expect(provider.id).toBe("anthropic");
    expect(provider.name).toBe("Anthropic");
  });

  it("exposes supported capabilities", () => {
    const provider = new AnthropicProvider(createClient());

    expect(provider.capabilities).toEqual([
      "writing",
      "research",
    ]);
  });

  it("exposes provider metadata", () => {
    const provider = new AnthropicProvider(createClient());

    expect(provider.metadata.vendor).toBe("Anthropic");
    expect(provider.metadata.supportsStreaming).toBe(true);
    expect(provider.metadata.supportsVision).toBe(true);
    expect(provider.metadata.supportsTools).toBe(true);
  });

  it("reports healthy status", async () => {
    const provider = new AnthropicProvider(createClient());

    const health = await provider.health();

    expect(health.status).toBe("healthy");
  });

  it("generates through the Anthropic client", async () => {
    const client = createClient();

    vi.spyOn(client.messages, "create").mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Hello from Claude",
        },
      ],
    } as never);

    const provider = new AnthropicProvider(
      client,
      "claude-sonnet-4",
    );

    const response = await provider.generate({
      capability: "writing",
      prompt: "Write a greeting",
    });

    expect(client.messages.create).toHaveBeenCalled();

    expect(response).toEqual({
      provider: "anthropic",
      capability: "writing",
      content: "Hello from Claude",
      model: "claude-sonnet-4",
    });
  });

  it("captures token usage when the API reports it", async () => {
    const client = createClient();

    vi.spyOn(
      client.messages,
      "create",
    ).mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Hi",
        },
      ],
      usage: {
        input_tokens: 200,
        output_tokens: 60,
      },
    } as never);

    const provider =
      new AnthropicProvider(
        client,
        "claude-sonnet-4",
      );

    const response =
      await provider.generate({
        capability: "writing",
        prompt: "Hi",
      });

    expect(response.inputTokens)
      .toBe(200);
    expect(response.outputTokens)
      .toBe(60);
    expect(response.tokensUsed)
      .toBe(260);
  });
});