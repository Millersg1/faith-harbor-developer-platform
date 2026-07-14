import { describe, expect, it } from "vitest";

import { OllamaClientFactory } from "./OllamaClientFactory";

describe("OllamaClientFactory", () => {
  it("uses the default localhost endpoint", () => {
    const client = OllamaClientFactory.create();

    expect(client.baseURL).toBe(
      "http://localhost:11434",
    );
  });

  it("uses a custom endpoint", () => {
    const client = OllamaClientFactory.create({
      baseURL: "http://192.168.1.25:11434",
    });

    expect(client.baseURL).toBe(
      "http://192.168.1.25:11434",
    );
  });

  it("preserves timeout configuration", () => {
    const client = OllamaClientFactory.create({
      timeout: 30000,
    });

    expect(client.timeout).toBe(30000);
  });
});