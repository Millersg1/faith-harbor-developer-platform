/**
 * The All Elite Cloud plan catalog.
 *
 * Plans are a fixed, code-defined catalog (not tenant data) so the pricing
 * shown on the marketing site and the limits enforced by the app come from
 * one place. A tenant's *choice* of plan is stored per-organization as a
 * subscription; the plan definition itself lives here.
 *
 * `null` in a limit means "unlimited". `priceCents: null` means custom
 * pricing (Enterprise — contact sales, not self-serve).
 */

export type PlanId =
  | "essentials"
  | "professional"
  | "business"
  | "partner"
  | "enterprise";

export interface PlanLimits {
  /** Team members (platform users) the organization may have. */
  seats: number | null;
  /** Verified white-label custom domains the organization may add. */
  customDomains: number | null;
  /** Projects the organization may create. */
  projects: number | null;
  /** Clients the organization may create. */
  clients: number | null;
}

export type LimitKind = keyof PlanLimits;

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in integer cents, or null for custom pricing. */
  priceCents: number | null;
  interval: "month";
  /** Whether a tenant can select this plan themselves (Enterprise can't). */
  selfServe: boolean;
  popular: boolean;
  features: string[];
  limits: PlanLimits;
}

/**
 * The catalog, in display order. Prices and names mirror the marketing
 * site's pricing section so the two never drift.
 */
export const PLANS: Plan[] = [
  {
    id: "essentials",
    name: "Cloud Essentials",
    priceCents: 1900,
    interval: "month",
    selfServe: true,
    popular: false,
    features: [
      "1 website + business hosting",
      "Business email + SSL",
      "Daily backups",
      "Basic AI",
    ],
    limits: {
      seats: 2,
      customDomains: 0,
      projects: 5,
      clients: 25,
    },
  },
  {
    id: "professional",
    name: "Cloud Professional",
    priceCents: 4900,
    interval: "month",
    selfServe: true,
    popular: false,
    features: [
      "Everything in Essentials",
      "Multiple sites + WordPress",
      "PostgreSQL + CRM + Projects",
      "Automation + priority support",
    ],
    limits: {
      seats: 5,
      customDomains: 1,
      projects: 25,
      clients: 200,
    },
  },
  {
    id: "business",
    name: "Cloud Business",
    priceCents: 9900,
    interval: "month",
    selfServe: true,
    popular: true,
    features: [
      "Everything in Professional",
      "Team users + advanced AI",
      "Analytics + developer APIs",
      "Premium infrastructure",
    ],
    limits: {
      seats: 15,
      customDomains: 3,
      projects: 100,
      clients: 1000,
    },
  },
  {
    id: "partner",
    name: "Platform Partner",
    priceCents: 19900,
    interval: "month",
    selfServe: true,
    popular: false,
    features: [
      "Everything in Business",
      "Full white-label + custom domains",
      "Reseller pricing + sub-accounts",
      "Dedicated partner success",
    ],
    limits: {
      seats: 50,
      customDomains: 25,
      projects: null,
      clients: null,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceCents: null,
    interval: "month",
    selfServe: false,
    popular: false,
    features: [
      "Dedicated infrastructure",
      "SSO + high availability",
      "Enterprise security",
      "Custom integrations + support",
    ],
    limits: {
      seats: null,
      customDomains: null,
      projects: null,
      clients: null,
    },
  },
];

/** The plan a brand-new organization is assumed to be on. */
export const DEFAULT_PLAN_ID: PlanId =
  "essentials";

/** Looks up a plan by id (returns undefined for an unknown id). */
export function getPlan(
  id: string,
): Plan | undefined {
  return PLANS.find(
    (p) => p.id === id,
  );
}

/** The default plan, guaranteed to exist. */
export function defaultPlan(): Plan {
  return getPlan(DEFAULT_PLAN_ID) as Plan;
}
