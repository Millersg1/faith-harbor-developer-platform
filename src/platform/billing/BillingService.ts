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
import type {
  OrganizationSubscriptionRecord,
  SubscriptionStatus,
} from "./OrganizationSubscription";
import { SubscriptionRepository } from "./SubscriptionRepository";
import { ProcessedEventsRepository } from "./ProcessedEventsRepository";
import {
  DisconnectedStripeSubscriptionGateway,
  type StripeSubscriptionGateway,
} from "./StripeSubscriptionGateway";

/**
 * Maps a Stripe subscription status onto our smaller set. Unknown or
 * not-yet-paid states are treated as `past_due` (retain access during the
 * retry window) rather than as canceled — access is only removed on a
 * definitive cancellation. See docs/17_BILLING_LIFECYCLE.md.
 */
export function mapStripeStatus(
  stripeStatus: string | undefined,
): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // past_due, unpaid, incomplete, paused, or anything unexpected.
      return "past_due";
  }
}

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
    private readonly processedEvents =
      new ProcessedEventsRepository(),
  ) {}

  /**
   * Idempotency gate for webhook processing. Returns `true` the first time an
   * event id is seen (process it) and `false` for a duplicate/replay (skip).
   */
  async beginEvent(
    eventId: string,
    type: string,
  ): Promise<boolean> {
    return this.processedEvents.markProcessed(
      eventId,
      type,
    );
  }

  /**
   * Resolves the org that owns a Stripe customer id from the mapping we stored
   * at checkout — the authoritative, tamper-resistant tenant binding for
   * subscription/invoice events (we never trust the event's own metadata for
   * this). Returns undefined when the customer isn't mapped to any tenant.
   */
  async findOrganizationByStripeCustomer(
    stripeCustomerId: string,
  ): Promise<string | undefined> {
    const record =
      await this.repository.findByStripeCustomerId(
        stripeCustomerId,
      );

    return record?.organizationId;
  }

  /** As above, keyed by the Stripe subscription id (a fallback binding). */
  async findOrganizationByStripeSubscription(
    stripeSubscriptionId: string,
  ): Promise<string | undefined> {
    const record =
      await this.repository.findByStripeSubscriptionId(
        stripeSubscriptionId,
      );

    return record?.organizationId;
  }

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

  /** Whether the current plan unlocks the marketplace's premium templates. */
  async includesPremiumTemplates(): Promise<boolean> {
    return (await this.getPlan())
      .premiumTemplates;
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
   * Applies a `customer.subscription.updated` event: maps the Stripe status
   * onto ours and, when Stripe reports the plan via metadata, keeps the plan
   * in sync. A mapped `canceled` status routes to the cancel path (drop to the
   * default plan). Otherwise the plan is retained (grace) — `past_due` never
   * removes access. Existing Stripe ids are preserved.
   */
  async applySubscriptionUpdated(input: {
    organizationId: string;
    stripeStatus?: string;
    planId?: string;
    currentPeriodEnd?: string | null;
  }): Promise<void> {
    const status = mapStripeStatus(
      input.stripeStatus,
    );

    if (status === "canceled") {
      await this.applySubscriptionCanceled(
        {
          organizationId:
            input.organizationId,
        },
      );

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
        // Only accept a plan change to a known plan; otherwise keep the plan
        // we already have. Never let an event downgrade an unknown plan.
        const nextPlan =
          input.planId &&
          getPlan(input.planId)
            ? input.planId
            : (existing?.planId ??
              defaultPlan().id);

        await this.repository.upsert({
          planId: nextPlan,
          status,
          currentPeriodEnd:
            input.currentPeriodEnd ??
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
      },
    );
  }

  /**
   * `invoice.payment_failed`: mark the subscription `past_due` but KEEP the
   * plan and all access. Service is retained through Stripe's retry window;
   * access is only removed on a definitive cancellation. Never touches data.
   */
  async applyPaymentFailed(input: {
    organizationId: string;
  }): Promise<void> {
    await this.transitionStatus(
      input.organizationId,
      "past_due",
    );
  }

  /**
   * `invoice.paid`: payment recovered — restore `active`, keeping the plan.
   * A definitively `canceled` subscription is left as-is.
   */
  async applyPaymentSucceeded(input: {
    organizationId: string;
  }): Promise<void> {
    await this.transitionStatus(
      input.organizationId,
      "active",
      // Don't resurrect a canceled subscription from a late invoice event.
      (current) =>
        current !== "canceled",
    );
  }

  /** Shared status transition that preserves plan + Stripe ids. */
  private async transitionStatus(
    organizationId: string,
    status: SubscriptionStatus,
    when: (
      current: SubscriptionStatus,
    ) => boolean = () => true,
  ): Promise<void> {
    await runWithTenant(
      { organizationId },
      async () => {
        const existing =
          await this.repository.get();
        const current =
          existing?.status ?? "active";

        if (!when(current)) {
          return;
        }

        await this.repository.upsert({
          planId:
            existing?.planId ??
            defaultPlan().id,
          status,
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
      },
    );
  }

  /**
   * Creates a Stripe Billing Portal URL for the acting tenant, so an
   * owner/admin can update the payment method. Returns null when there is no
   * Stripe customer yet or billing isn't connected.
   */
  async createBillingPortalUrl(input: {
    returnUrl: string;
  }): Promise<string | null> {
    if (!this.gateway.isConnected()) {
      return null;
    }

    const subscription =
      await this.getSubscription();

    if (
      !subscription.stripeCustomerId
    ) {
      return null;
    }

    const { url } =
      await this.gateway.createBillingPortalSession(
        {
          customerId:
            subscription.stripeCustomerId,
          returnUrl: input.returnUrl,
        },
      );

    return url;
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
