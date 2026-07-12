import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { AIBootstrap } from "./AIBootstrap";
import { OpenAIClientFactory } from "../config/OpenAIClientFactory";

describe("AIBootstrap", () => {
  it("creates a configured AI service", () => {
    const client = new OpenAI({
      apiKey: "test-api-key",
    });

    vi.spyOn(OpenAIClientFactory, "create").mockReturnValue(client);

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
});