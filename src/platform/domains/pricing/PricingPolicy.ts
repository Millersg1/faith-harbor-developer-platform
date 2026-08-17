/**
 * Domain pricing policy: the customer price is the provider's chargeable cost
 * plus the **greater of** a plan-tiered percentage markup **or** a plan-tiered
 * fixed minimum markup — so a low promotional wholesale price can never leave
 * All Elite Cloud underwater after Stripe fees and support cost.
 *
 * All money is integer minor units (cents). No floating-point money. The single
 * rounding happens when the percentage markup is computed; the final customer
 * price is then integer addition.
 *
 * IMPORTANT: the numbers below are PROVISIONAL (`provisional: true`) — they are
 * the figures previously discussed, kept in ONE configurable place, and are NOT
 * to be treated as final commercial pricing until explicitly approved. A pricing
 * change bumps `version`; existing quotes/orders reference the version they were
 * priced under and are never rewritten.
 */

import { DEFAULT_PLAN_ID, type PlanId } from "../../billing/Plan";

export interface PlanMarkupRule {
  /** Percentage markup in basis points (1% = 100 bps). */
  percentBps: number;
  /** Minimum markup in minor units (cents), applied when it exceeds the %. */
  minMarkupMinor: number;
}

export interface PricingPolicy {
  version: number;
  /** True while the numbers await final commercial approval. */
  provisional: boolean;
  byPlan: Record<PlanId, PlanMarkupRule>;
}

/** Provisional default policy (version 1) — pending final commercial approval. */
export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  version: 1,
  provisional: true,
  byPlan: {
    essentials: { percentBps: 3000, minMarkupMinor: 400 },
    professional: { percentBps: 2500, minMarkupMinor: 350 },
    business: { percentBps: 2000, minMarkupMinor: 300 },
    partner: { percentBps: 1500, minMarkupMinor: 250 },
    enterprise: { percentBps: 1000, minMarkupMinor: 200 },
  },
};

export function ruleForPlan(
  policy: PricingPolicy,
  planId: string,
): PlanMarkupRule {
  return (
    policy.byPlan[planId as PlanId] ?? policy.byPlan[DEFAULT_PLAN_ID]
  );
}

/** Markup = greater of (cost × %bps, rounded once) or the fixed minimum. */
export function markupMinor(
  costMinor: number,
  rule: PlanMarkupRule,
): number {
  if (!Number.isInteger(costMinor) || costMinor < 0) {
    throw new Error("costMinor must be a non-negative integer (minor units).");
  }
  const pct = Math.round((costMinor * rule.percentBps) / 10_000);
  return Math.max(pct, rule.minMarkupMinor);
}

/** Customer price = provider cost + markup (integer minor units). */
export function customerPriceMinor(
  costMinor: number,
  rule: PlanMarkupRule,
): number {
  return costMinor + markupMinor(costMinor, rule);
}
