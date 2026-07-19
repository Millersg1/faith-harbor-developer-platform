import { describe, expect, it } from "vitest";

import { ProviderMetadataRegistry } from "./ProviderMetadataRegistry";

const openAI = {
  vendor: "OpenAI",
  version: "1.0.0",
  models: ["gpt-5.5", "gpt-5-mini"],
  supportsStreaming: true,
  supportsVision: true,
  supportsTools: true,
  website: "https://openai.com",
  documentation: "https://platform.openai.com/docs",
};

const anthropic = {
  vendor: "Anthropic",
  version: "1.0.0",
  models: ["claude-sonnet-4"],
  supportsStreaming: true,
  supportsVision: true,
  supportsTools: true,
  website: "https://anthropic.com",
  documentation: "https://docs.anthropic.com",
};

describe("ProviderMetadataRegistry", () => {
  it("registers metadata", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("openai", openAI);

    expect(registry.get("openai")).toEqual(openAI);
  });

  it("returns all metadata", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("openai", openAI);
    registry.register("anthropic", anthropic);

    expect(registry.getAll()).toHaveLength(2);
  });

  it("finds providers by vendor", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("openai", openAI);
    registry.register("anthropic", anthropic);

    expect(
      registry.findByVendor("OpenAI"),
    ).toEqual([openAI]);
  });

  it("finds providers supporting streaming", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("openai", openAI);

    expect(
      registry.findStreaming(),
    ).toEqual([openAI]);
  });

  it("finds providers supporting vision", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("anthropic", anthropic);

    expect(
      registry.findVision(),
    ).toEqual([anthropic]);
  });

  it("finds providers supporting tools", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("anthropic", anthropic);

    expect(
      registry.findTools(),
    ).toEqual([anthropic]);
  });

  it("finds providers by model", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("openai", openAI);

    expect(
      registry.findByModel("gpt-5-mini"),
    ).toEqual([openAI]);
  });

  it("clears metadata", () => {
    const registry = new ProviderMetadataRegistry();

    registry.register("openai", openAI);

    registry.clear();

    expect(
      registry.getAll(),
    ).toHaveLength(0);
  });
});