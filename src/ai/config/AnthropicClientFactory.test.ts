import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { AnthropicClientFactory } from "./AnthropicClientFactory";

describe("AnthropicClientFactory", () => {
  it("creates an Anthropic client", () => {
    const client = AnthropicClientFactory.create({
      apiKey: "test-api-key",
    });

    expect(client).toBeInstanceOf(Anthropic);
  });

  it("creates a client with optional configuration", () => {
    const client = AnthropicClientFactory.create({
      apiKey: "test-api-key",
      baseURL: "https://example.com",
      timeout: 30000,
      maxRetries: 2,
    });

    expect(client).toBeInstanceOf(Anthropic);
  });

  it("rejects an empty API key", () => {
    expect(() =>
      AnthropicClientFactory.create({
        apiKey: "   ",
      }),
    ).toThrow(
      "Anthropic API key cannot be empty.",
    );
  });
});