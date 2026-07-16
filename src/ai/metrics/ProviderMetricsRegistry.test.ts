import {
  describe,
  expect,
  it,
} from "vitest";

import { ProviderMetricsRegistry } from "./ProviderMetricsRegistry";

describe("ProviderMetricsRegistry", () => {
  it("registers a provider scorecard", () => {
    const registry =
      new ProviderMetricsRegistry();

    const scorecard = registry.register(
      "ollama",
      "Ollama",
    );

    expect(scorecard.providerId).toBe(
      "ollama",
    );
    expect(scorecard.providerName).toBe(
      "Ollama",
    );
    expect(scorecard.statistics).toEqual({
      requests: 0,
      successes: 0,
      failures: 0,
      averageResponseTime: 0,
      averageTokens: 0,
      estimatedCost: 0,
    });
    expect(scorecard.reliabilityScore).toBe(
      100,
    );
    expect(scorecard.overallScore).toBe(100);
  });

  it("returns the existing scorecard when registering twice", () => {
    const registry =
      new ProviderMetricsRegistry();

    const first = registry.register(
      "openai",
      "OpenAI",
    );

    const second = registry.register(
      "openai",
      "Different Name",
    );

    expect(second).toBe(first);
    expect(second.providerName).toBe(
      "OpenAI",
    );
    expect(registry.size).toBe(1);
  });

  it("returns a registered scorecard", () => {
    const registry =
      new ProviderMetricsRegistry();

    const scorecard = registry.register(
      "blackbox",
      "Blackbox AI",
    );

    expect(registry.get("blackbox")).toBe(
      scorecard,
    );
  });

  it("returns undefined for an unknown provider", () => {
    const registry =
      new ProviderMetricsRegistry();

    expect(
      registry.get("missing"),
    ).toBeUndefined();
  });

  it("reports whether a provider is registered", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "anthropic",
      "Anthropic",
    );

    expect(
      registry.has("anthropic"),
    ).toBe(true);
    expect(
      registry.has("openrouter"),
    ).toBe(false);
  });

  it("returns all scorecards", () => {
    const registry =
      new ProviderMetricsRegistry();

    const openAI = registry.register(
      "openai",
      "OpenAI",
    );

    const ollama = registry.register(
      "ollama",
      "Ollama",
    );

    expect(registry.getAll()).toEqual([
      openAI,
      ollama,
    ]);
  });

  it("records a successful execution", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "ollama",
      "Ollama",
    );

    const scorecard =
      registry.recordExecution(
        "ollama",
        {
          success: true,
          responseTime: 1200,
          tokensUsed: 300,
          estimatedCost: 0,
          completedAt:
            "2026-07-15T20:00:00.000Z",
        },
      );

    expect(scorecard.statistics).toEqual({
      requests: 1,
      successes: 1,
      failures: 0,
      averageResponseTime: 1200,
      averageTokens: 300,
      estimatedCost: 0,
      lastUsed:
        "2026-07-15T20:00:00.000Z",
    });

    expect(scorecard.reliabilityScore).toBe(
      100,
    );
    expect(scorecard.overallScore).toBe(88);
  });

  it("records a failed execution", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "openai",
      "OpenAI",
    );

    const scorecard =
      registry.recordExecution(
        "openai",
        {
          success: false,
          responseTime: 500,
          estimatedCost: 0.2,
          completedAt:
            "2026-07-15T20:05:00.000Z",
        },
      );

    expect(scorecard.statistics.requests).toBe(
      1,
    );
    expect(
      scorecard.statistics.successes,
    ).toBe(0);
    expect(
      scorecard.statistics.failures,
    ).toBe(1);
    expect(
      scorecard.statistics.estimatedCost,
    ).toBe(0.2);
    expect(scorecard.reliabilityScore).toBe(
      0,
    );
    expect(scorecard.overallScore).toBe(0);
  });

  it("calculates running averages across executions", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "blackbox",
      "Blackbox AI",
    );

    registry.recordExecution(
      "blackbox",
      {
        success: true,
        responseTime: 1000,
        tokensUsed: 200,
        estimatedCost: 0.01,
      },
    );

    const scorecard =
      registry.recordExecution(
        "blackbox",
        {
          success: true,
          responseTime: 3000,
          tokensUsed: 600,
          estimatedCost: 0.03,
        },
      );

    expect(scorecard.statistics.requests).toBe(
      2,
    );
    expect(
      scorecard.statistics.successes,
    ).toBe(2);
    expect(
      scorecard.statistics.failures,
    ).toBe(0);
    expect(
      scorecard.statistics.averageResponseTime,
    ).toBe(2000);
    expect(
      scorecard.statistics.averageTokens,
    ).toBe(400);
    expect(
      scorecard.statistics.estimatedCost,
    ).toBeCloseTo(0.04);
    expect(scorecard.reliabilityScore).toBe(
      100,
    );
  });

  it("calculates reliability from successes and failures", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "anthropic",
      "Anthropic",
    );

    registry.recordExecution(
      "anthropic",
      {
        success: true,
        responseTime: 100,
      },
    );

    registry.recordExecution(
      "anthropic",
      {
        success: false,
        responseTime: 100,
      },
    );

    const scorecard =
      registry.get("anthropic");

    expect(
      scorecard?.statistics.requests,
    ).toBe(2);
    expect(
      scorecard?.statistics.successes,
    ).toBe(1);
    expect(
      scorecard?.statistics.failures,
    ).toBe(1);
    expect(
      scorecard?.reliabilityScore,
    ).toBe(50);
  });

  it("preserves the token average when tokens are unavailable", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "openrouter",
      "OpenRouter",
    );

    registry.recordExecution(
      "openrouter",
      {
        success: true,
        responseTime: 500,
        tokensUsed: 400,
      },
    );

    const scorecard =
      registry.recordExecution(
        "openrouter",
        {
          success: true,
          responseTime: 700,
        },
      );

    expect(
      scorecard.statistics.averageTokens,
    ).toBe(400);
  });

  it("throws when recording metrics for an unknown provider", () => {
    const registry =
      new ProviderMetricsRegistry();

    expect(() =>
      registry.recordExecution(
        "missing",
        {
          success: true,
          responseTime: 100,
        },
      ),
    ).toThrow(
      'Provider metrics are not registered for "missing".',
    );
  });

  it("unregisters a provider scorecard", () => {
    const registry =
      new ProviderMetricsRegistry();

    registry.register(
      "openrouter",
      "OpenRouter",
    );

    expect(
      registry.unregister("openrouter"),
    ).toBe(true);
    expect(
      registry.has("openrouter"),
    ).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("returns false when unregistering an unknown provider", () => {
    const registry =
      new ProviderMetricsRegistry();

    expect(
      registry.unregister("missing"),
    ).toBe(false);
  });
});