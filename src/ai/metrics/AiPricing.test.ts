import {
  describe,
  expect,
  it,
} from "vitest";

import {
  estimateCost,
  isFreeModel,
  isPriced,
} from "./AiPricing";

describe("AiPricing", () => {
  it("estimates cost from input and output tokens", () => {
    // claude-sonnet-4: $3 / 1M input, $15 / 1M output.
    // 1,000,000 input + 1,000,000 output = 3 + 15 = 18.
    const cost = estimateCost(
      "claude-sonnet-4",
      1_000_000,
      1_000_000,
    );

    expect(cost).toBe(18);
  });

  it("prices input and output at different rates", () => {
    // gpt-5.5: $5 / 1M input, $15 / 1M output.
    // 100k input = 0.5, 10k output = 0.15 -> 0.65.
    const cost = estimateCost(
      "gpt-5.5",
      100_000,
      10_000,
    );

    expect(cost).toBeCloseTo(0.65, 6);
  });

  it("treats local Ollama models as free", () => {
    expect(
      estimateCost(
        "hermes3:latest",
        10_000,
        10_000,
      ),
    ).toBe(0);

    expect(isFreeModel("hermes3:latest"))
      .toBe(true);
  });

  it("returns zero for an unpriced model", () => {
    expect(
      estimateCost(
        "mystery-model-9",
        1_000_000,
        1_000_000,
      ),
    ).toBe(0);

    expect(isPriced("mystery-model-9"))
      .toBe(false);
  });

  it("returns zero when no model is given", () => {
    expect(estimateCost(undefined, 100, 100))
      .toBe(0);
  });

  it("knows which models are priced", () => {
    expect(isPriced("gpt-5.5")).toBe(true);
    expect(isPriced("claude-opus-4-1"))
      .toBe(true);
    expect(isPriced(undefined)).toBe(false);
  });
});
