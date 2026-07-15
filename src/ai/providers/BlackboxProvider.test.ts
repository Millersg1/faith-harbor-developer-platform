import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AIRequest } from "../AIProvider";
import { BlackboxProvider } from "./BlackboxProvider";

describe("BlackboxProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns a successful AI response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "blackboxai/openai/gpt-5.5",
        choices: [
          {
            message: {
              content: "Hello from Blackbox.",
            },
          },
        ],
        usage: {
          total_tokens: 42,
        },
      }),
    }) as typeof fetch;

    const provider = new BlackboxProvider("test-key");

    const request: AIRequest = {
      capability: "writing",
      prompt: "Hello",
    };

    const response = await provider.generate(request);

    expect(response.provider).toBe("blackbox");
    expect(response.capability).toBe("writing");
    expect(response.content).toBe("Hello from Blackbox.");
    expect(response.model).toBe(
      "blackboxai/openai/gpt-5.5",
    );
    expect(response.tokensUsed).toBe(42);
  });

  it("throws when the API returns an error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: "Unauthorized",
        },
      }),
    }) as typeof fetch;

    const provider = new BlackboxProvider("bad-key");

    await expect(
      provider.generate({
        capability: "writing",
        prompt: "Hello",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("reports a healthy status", async () => {
    const provider = new BlackboxProvider("test-key");

    const health = await provider.health();

    expect(health.status).toBe("healthy");
    expect(health.checkedAt).toBeDefined();
  });

  it("exposes provider metadata", () => {
    const provider = new BlackboxProvider("test-key");

    expect(provider.id).toBe("blackbox");
    expect(provider.name).toBe("Blackbox AI");
    expect(provider.capabilities).toContain(
      "writing",
    );
    expect(provider.capabilities).toContain(
      "research",
    );
    expect(provider.metadata.vendor).toBe(
      "Blackbox AI",
    );
    expect(
      provider.metadata.supportsStreaming,
    ).toBe(true);
    expect(
      provider.metadata.supportsVision,
    ).toBe(true);
    expect(
      provider.metadata.supportsTools,
    ).toBe(true);
  });
});