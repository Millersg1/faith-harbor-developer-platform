import {
  requireTenant,
  runWithTenant,
} from "../../tenancy/TenantContext";
import {
  defaultPlan,
  getPlan,
  type LimitKind,
  type Plan,
} from "./Plan";
import type { OrganizationSubscriptionRecord } from "./OrganizationSubscription";
import { SubscriptionRepository } from "./SubscriptionRepository";
import {
  DisconnectedStripeSubscriptionGateway,
  type StripeSubscriptionGateway,
} from "./StripeSubscriptionGateway";

/** The outcome of starting a plan change. */
export type PlanChangeOutcome =
  | {
      status: "changed";
      subscription: OrganizationSubscriptionRecord;
    }
  | {
      status: "checkout";
      url: string;
    };

export interface StartPlanChangeOptions {
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

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
    private readonly gateway: StripeSubscriptionGateway =
      new DisconnectedStripeSubscriptionGateway(),
  ) {}

  /** Whether real (Stripe) billing is connected. */
  billingConnected(): boolean {
    return this.gateway.isConnected();
  }

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
   * Begins a plan change. For a free plan, or when Stripe isn't connected,
   * the switch is immediate ("changed"). For a paid plan with Stripe
   * connected, it creates a Checkout session and returns its URL — the plan
   * only actually changes once Stripe confirms payment via the webhook, so
   * nobody gets a paid tier without paying.
   */
  async startPlanChange(
    planId: string,
    options: StartPlanChangeOptions,
  ): Promise<PlanChangeOutcome> {
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

    const paid =
      plan.priceCents !== null &&
      plan.priceCents > 0;

    if (
      !paid ||
      !this.gateway.isConnected()
    ) {
      const subscription =
        await this.changePlan(plan.id);

      return {
        status: "changed",
        subscription,
      };
    }

    const organizationId =
      requireTenant().organizationId;

    const result =
      await this.gateway.createSubscriptionCheckout(
        {
          organizationId,
          planId: plan.id,
          planName: plan.name,
          amountCents:
            plan.priceCents as number,
          currency: "usd",
          customerEmail:
            options.customerEmail,
          successUrl:
            options.successUrl,
          cancelUrl: options.cancelUrl,
        },
      );

    return {
      status: "checkout",
      url: result.url,
    };
  }

  /** Verifies a Stripe webhook signature (delegates to the gateway). */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean {
    return this.gateway.verifyWebhook(
      rawBody,
      signatureHeader,
    );
  }

  /**
   * Activates a paid subscription after Stripe confirms checkout. Runs in
   * the org's tenant scope — the org id comes from Stripe metadata we set at
   * checkout, trusted only because the webhook signature is verified before
   * this is ever called.
   */
  async applyCheckoutCompleted(input: {
    organizationId: string;
    planId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    currentPeriodEnd?: string | null;
  }): Promise<void> {
    const plan = getPlan(input.planId);

    if (!plan) {
      return;
    }

    await runWithTenant(
      {
        organizationId:
          input.organizationId,
      },
      async () => {
        const existing =
          await this.repository.get();

        await this.repository.upsert({
          planId: plan.id,
          status: "active",
          currentPeriodEnd:
            input.currentPeriodEnd ??
            existing?.currentPeriodEnd ??
            null,
          stripeCustomerId:
            input.stripeCustomerId ??
            existing?.stripeCustomerId ??
            null,
          stripeSubscriptionId:
            input.stripeSubscriptionId ??
            existing?.stripeSubscriptionId ??
            null,
          updatedAt:
            new Date().toISOString(),
        });
      },
    );
  }

  /**
   * Handles a canceled/ended subscription by dropping the org back to the
   * default (free) plan.
   */
  async applySubscriptionCanceled(input: {
    organizationId: string;
  }): Promise<void> {
    await runWithTenant(
      {
        organizationId:
          input.organizationId,
      },
      async () => {
        const existing =
          await this.repository.get();

        await this.repository.upsert({
          planId: defaultPlan().id,
          status: "canceled",
          currentPeriodEnd: null,
          stripeCustomerId:
            existing?.stripeCustomerId ??
            null,
          stripeSubscriptionId: null,
          updatedAt:
            new Date().toISOString(),
        });
      },
    );
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
    sites: "websites",
    aiGenerations:
      "AI generations this month",
    projects: "projects",
    clients: "clients",
  };

  const noun = label[kind];

  if (limit === 0) {
    return `${planName} doesn't include ${noun}. Upgrade your plan to add ${noun}.`;
  }

  return `Your ${planName} plan is limited to ${limit} ${noun}. Upgrade to add more.`;
}
