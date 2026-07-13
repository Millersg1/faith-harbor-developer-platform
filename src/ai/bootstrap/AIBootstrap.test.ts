import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AnthropicClientFactory } from "../config/AnthropicClientFactory";
import { OpenAIClientFactory } from "../config/OpenAIClientFactory";
import { AnthropicProviderInstaller } from "../installers/AnthropicProviderInstaller";
import { OpenAIProviderInstaller } from "../installers/OpenAIProviderInstaller";
import { AIBootstrap } from "./AIBootstrap";

describe("AIBootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a service with OpenAI", async () => {
    const client = new OpenAI({
      apiKey: "test-api-key",
    });

    vi.spyOn(
      OpenAIClientFactory,
      "create",
    ).mockReturnValue(client);

    const service = await AIBootstrap.create([
      new OpenAIProviderInstaller({
        apiKey: "test-api-key",
      }),
    ]);

    expect(OpenAIClientFactory.create).toHaveBeenCalledWith({
      apiKey: "test-api-key",
    });

    expect(service.hasProvider("openai")).toBe(true);
    expect(service.getProviders()).toHaveLength(1);
  });

  it("creates a service with Anthropic", async () => {
    const client = new Anthropic({
      apiKey: "test-api-key",
    });

    vi.spyOn(
      AnthropicClientFactory,
      "create",
    ).mockReturnValue(client);

    const service = await AIBootstrap.create([
      new AnthropicProviderInstaller({
        apiKey: "test-api-key",
      }),
    ]);

    expect(AnthropicClientFactory.create).toHaveBeenCalledWith({
      apiKey: "test-api-key",
    });

    expect(service.hasProvider("anthropic")).toBe(true);
    expect(service.getProviders()).toHaveLength(1);
  });

  it("creates a service with multiple providers", async () => {
    const openAIClient = new OpenAI({
      apiKey: "openai-test-key",
    });

    const anthropicClient = new Anthropic({
      apiKey: "anthropic-test-key",
    });

    vi.spyOn(
      OpenAIClientFactory,
      "create",
    ).mockReturnValue(openAIClient);

    vi.spyOn(
      AnthropicClientFactory,
      "create",
    ).mockReturnValue(anthropicClient);

    const service = await AIBootstrap.create([
      new OpenAIProviderInstaller({
        apiKey: "openai-test-key",
      }),
      new AnthropicProviderInstaller({
        apiKey: "anthropic-test-key",
      }),
    ]);

    expect(service.hasProvider("openai")).toBe(true);
    expect(service.hasProvider("anthropic")).toBe(true);
    expect(service.getProviders()).toHaveLength(2);
  });

  it("generates through the OpenAI provider", async () => {
    const client = new OpenAI({
      apiKey: "test-api-key",
    });

    vi.spyOn(
      client.responses,
      "create",
    ).mockResolvedValue({
      output_text: "Faith Harbor response",
    } as never);

    vi.spyOn(
      OpenAIClientFactory,
      "create",
    ).mockReturnValue(client);

    const service = await AIBootstrap.create([
      new OpenAIProviderInstaller({
        apiKey: "test-api-key",
      }),
    ]);

    const response = await service.generate({
      capability: "writing",
      prompt: "Write a welcome message",
    });

    expect(response).toEqual({
      provider: "openai",
      capability: "writing",
      content: "Faith Harbor response",
      model: "gpt-5.5",
    });
  });

  it("rejects an empty installer list", async () => {
    await expect(
      AIBootstrap.create([]),
    ).rejects.toThrow(
      "At least one AI provider installer is required.",
    );
  });
});