/**
 * A single metered AI operation for one organization — how the platform
 * knows what every tenant's AI usage costs. Cost is stored in integer
 * micro-dollars (millionths of a dollar) because a single generation costs a
 * fraction of a cent, which integer cents would round away.
 *
 * `ownKey` is true when the tenant ran on their own key (their spend), so it
 * does NOT count against the platform's cost — only `ownKey=false` events are
 * money the platform owner pays.
 */
export interface AiUsageEventRecord {
  id: string;
  organizationId: string;
  kind: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  ownKey: boolean;
  createdAt: string;
}

export interface AiUsageSummary {
  generations: number;
  inputTokens: number;
  outputTokens: number;
  /** Total estimated cost in micro-dollars across all events. */
  costMicros: number;
  /** Cost the platform bears (events NOT on the tenant's own key). */
  platformCostMicros: number;
}

/**
 * Rough per-model pricing in USD per 1,000,000 tokens, which equals
 * micro-dollars per token. `:free` models cost nothing.
 */
const PRICING: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o": {
    input: 2.5,
    output: 10,
  },
  "openai/gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
};

const DEFAULT_PRICE = {
  input: 0.5,
  output: 1.5,
};

/** Estimates the cost of a call in integer micro-dollars. */
export function estimateCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (/:free\b|:free$/i.test(model)) {
    return 0;
  }

  const price =
    PRICING[model] ?? DEFAULT_PRICE;

  return Math.round(
    inputTokens * price.input +
      outputTokens * price.output,
  );
}
