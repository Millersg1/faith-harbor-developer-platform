/**
 * Per-model AI pricing, in US dollars per one million tokens.
 *
 * These are ESTIMATES for planning and are the single place to edit
 * when your provider's rates change. Input (prompt) and output
 * (completion) tokens are usually billed at different rates. Local
 * models (for example Ollama) are free and priced at zero.
 *
 * A model not listed here is treated as unpriced: its usage is still
 * counted, but its cost is reported as zero and flagged so you know
 * to add a rate.
 */
export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<
  string,
  ModelPrice
> = {
  // OpenAI (estimates — adjust to your plan)
  "gpt-5.5": {
    inputPer1M: 5,
    outputPer1M: 15,
  },
  "gpt-5.4": {
    inputPer1M: 3,
    outputPer1M: 12,
  },
  "gpt-5-mini": {
    inputPer1M: 0.5,
    outputPer1M: 2,
  },

  // Anthropic (estimates — adjust to your plan)
  "claude-opus-4-1": {
    inputPer1M: 15,
    outputPer1M: 75,
  },
  "claude-sonnet-4": {
    inputPer1M: 3,
    outputPer1M: 15,
  },
  "claude-haiku-3-5": {
    inputPer1M: 0.8,
    outputPer1M: 4,
  },
};

/**
 * Models that run locally and never incur a charge.
 */
const FREE_MODEL_PATTERNS = [
  /^ollama/i,
  /:.*$/, // Ollama-style "name:tag" identifiers
];

/**
 * Returns whether a model has a known price (or is known to be free).
 */
export function isPriced(
  model?: string,
): boolean {
  if (!model) {
    return false;
  }

  if (isFreeModel(model)) {
    return true;
  }

  return model in MODEL_PRICING;
}

/**
 * Returns whether a model is known to run locally / free of charge.
 */
export function isFreeModel(
  model: string,
): boolean {
  return FREE_MODEL_PATTERNS.some(
    (pattern) =>
      pattern.test(model),
  );
}

/**
 * Estimates the US-dollar cost of one request.
 *
 * Returns 0 for free/local models and for models without a listed
 * price. The result is rounded to six decimal places so fractions of
 * a cent are preserved without noisy floating-point tails.
 */
export function estimateCost(
  model: string | undefined,
  inputTokens = 0,
  outputTokens = 0,
): number {
  if (!model || isFreeModel(model)) {
    return 0;
  }

  const price =
    MODEL_PRICING[model];

  if (!price) {
    return 0;
  }

  const cost =
    (inputTokens / 1_000_000) *
      price.inputPer1M +
    (outputTokens / 1_000_000) *
      price.outputPer1M;

  return (
    Math.round(cost * 1_000_000) /
    1_000_000
  );
}
