import { requireTenant } from "../../tenancy/TenantContext";
import {
  defaultPlan,
  getPlan,
  type LimitKind,
  type Plan,
} from "./Plan";
import type { OrganizationSubscriptionRecord } from "./OrganizationSubscription";
import { SubscriptionRepository } from "./SubscriptionRepository";

/**
 * Thrown when an action would exceed the acting tenant's plan limit. The
 * API layer turns this into a 402 Payment Required with an upgrade prompt.
 */
export class PlanLimitError extends Error {
  constructor(
    public readonly kind: LimitKind,
    public readonly limit: number,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/**
 * Reads and changes the acting tenant's subscription, and enforces plan
 * limits. A tenant that has never chosen a plan is treated as being on the
 * default (entry) plan, so callers always get a concrete plan back.
 */
export class BillingService {
  constructor(
    private readonly repository =
      new SubscriptionRepository(),
  ) {}

  /**
   * The tenant's subscription, synthesizing a default (entry plan, active)
   * one when none has been stored yet.
   */
  async getSubscription(): Promise<OrganizationSubscriptionRecord> {
    const existing =
      await this.repository.get();

    if (existing) {
      return existing;
    }

    return {
      organizationId:
        requireTenant()
          .organizationId,
      planId: defaultPlan().id,
      status: "active",
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      updatedAt: "",
    };
  }

  /** The plan the tenant is currently on (falls back to the default). */
  async getPlan(): Promise<Plan> {
    const subscription =
      await this.getSubscription();

    return (
      getPlan(subscription.planId) ??
      defaultPlan()
    );
  }

  /**
   * Switches the tenant to a different self-serve plan. Rejects unknown
   * plans and plans that aren't self-serve (Enterprise is contact-sales).
   *
   * In this increment the switch is immediate; once Stripe is wired, a
   * move to a paid plan will route through checkout before it takes effect.
   */
  async changePlan(
    planId: string,
  ): Promise<OrganizationSubscriptionRecord> {
    const plan = getPlan(planId);

    if (!plan) {
      throw new Error(
        "Unknown plan.",
      );
    }

    if (!plan.selfServe) {
      throw new Error(
        "That plan is set up with our team — contact sales to enable it.",
      );
    }

    const existing =
      await this.repository.get();

    return this.repository.upsert({
      planId: plan.id,
      status: "active",
      currentPeriodEnd:
        existing?.currentPeriodEnd ??
        null,
      stripeCustomerId:
        existing?.stripeCustomerId ??
        null,
      stripeSubscriptionId:
        existing?.stripeSubscriptionId ??
        null,
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Throws a {@link PlanLimitError} when adding one more of `kind` would
   * exceed the tenant's plan limit. A `null` limit means unlimited, so it
   * never throws.
   */
  async assertWithinLimit(
    kind: LimitKind,
    currentCount: number,
  ): Promise<void> {
    const plan = await this.getPlan();
    const limit = plan.limits[kind];

    if (
      limit !== null &&
      currentCount >= limit
    ) {
      throw new PlanLimitError(
        kind,
        limit,
        limitMessage(
          plan.name,
          kind,
          limit,
        ),
      );
    }
  }
}

function limitMessage(
  planName: string,
  kind: LimitKind,
  limit: number,
): string {
  const label: Record<
    LimitKind,
    string
  > = {
    seats: "team members",
    customDomains:
      "custom domains",
    projects: "projects",
    clients: "clients",
  };

  const noun = label[kind];

  if (limit === 0) {
    return `${planName} doesn't include ${noun}. Upgrade your plan to add ${noun}.`;
  }

  return `Your ${planName} plan is limited to ${limit} ${noun}. Upgrade to add more.`;
}
