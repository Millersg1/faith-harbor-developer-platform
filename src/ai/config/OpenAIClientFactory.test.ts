import OpenAI from "openai";
import { describe, expect, it } from "vitest";

import { OpenAIClientFactory } from "./OpenAIClientFactory";

describe("OpenAIClientFactory", () => {
  it("creates an OpenAI client", () => {
    const client = OpenAIClientFactory.create({
      apiKey: "test-api-key",
    });

    expect(client).toBeInstanceOf(OpenAI);
  });

  it("creates a client with optional configuration", () => {
    const client = OpenAIClientFactory.create({
      apiKey: "test-api-key",
      organization: "test-organization",
      project: "test-project",
      baseURL: "https://example.com/v1",
      timeout: 30_000,
      maxRetries: 2,
    });

    expect(client).toBeInstanceOf(OpenAI);
  });

  it("rejects an empty API key", () => {
    expect(() =>
      OpenAIClientFactory.create({
        apiKey: "   ",
      }),
    ).toThrow("OpenAI API key cannot be empty.");
  });
});