import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { OpenRouterClientFactory } from "./OpenRouterClientFactory";

describe("OpenRouterClientFactory", () => {
  it("creates an OpenRouter client", () => {
    const client = OpenRouterClientFactory.create({
      apiKey: "test-api-key",
    });

    expect(client).toBeInstanceOf(OpenAI);
  });

  it("creates a client with optional configuration", () => {
    const client = OpenRouterClientFactory.create({
      apiKey: "test-api-key",
      referer: "https://faithharbor.org",
      title: "Faith Harbor OS",
      timeout: 30000,
      maxRetries: 2,
    });

    expect(client).toBeInstanceOf(OpenAI);
  });

  it("rejects an empty API key", () => {
    expect(() =>
      OpenRouterClientFactory.create({
        apiKey: "   ",
      }),
    ).toThrow(
      "OpenRouter API key cannot be empty.",
    );
  });
});