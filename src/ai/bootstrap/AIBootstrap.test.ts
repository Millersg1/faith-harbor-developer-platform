import OpenAI from "openai";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { OpenAIClientFactory } from "../config/OpenAIClientFactory";
import { AIBootstrap } from "./AIBootstrap";

describe("AIBootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a configured AI service", () => {
    const client = new OpenAI({
      apiKey: "test-api-key",
    });

    vi.spyOn(
      OpenAIClientFactory,
      "create",
    ).mockReturnValue(client);

    const service = AIBootstrap.create({
      apiKey: "test-api-key",
    });

    expect(OpenAIClientFactory.create).toHaveBeenCalledWith({
      apiKey: "test-api-key",
    });

    expect(service.hasProvider("openai")).toBe(true);
    expect(service.getProviders()).toHaveLength(1);
    expect(service.getProviders()[0]?.id).toBe("openai");
  });

  it("generates through the complete AI framework", async () => {
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

    const service = AIBootstrap.create({
      apiKey: "test-api-key",
    });

    const response = await service.generate({
      capability: "writing",
      prompt: "Write a welcome message",
    });

    expect(client.responses.create).toHaveBeenCalledWith({
      model: "gpt-5.5",
      input: "Write a welcome message",
    });

    expect(response).toEqual({
      provider: "openai",
      capability: "writing",
      content: "Faith Harbor response",
      model: "gpt-5.5",
    });
  });
});