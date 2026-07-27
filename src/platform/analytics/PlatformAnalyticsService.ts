import type { OrganizationService } from "../../tenancy/OrganizationService";
import type { AiUsageRepository } from "../ai/AiUsageRepository";
import {
  defaultPlan,
  getPlan,
} from "../billing/Plan";
import type { SubscriptionRepository } from "../billing/SubscriptionRepository";

/** One plan's contribution to the platform's recurring revenue. */
export interface PlanBreakdown {
  planId: string;
  name: string;
  count: number;
  mrrUsd: number;
}

/** A cross-tenant, platform-owner view of the business. */
export interface PlatformAnalyticsSummary {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  /** Active, billable subscriptions (active orgs on an active plan). */
  activeSubscriptions: number;
  mrrUsd: number;
  arrUsd: number;
  byPlan: PlanBreakdown[];
  /** Platform-borne AI cost this month (usage NOT on a tenant's own key). */
  aiPlatformCostUsdMTD: number;
  /** MRR minus month-to-date platform AI cost — a rough gross signal. */
  netAfterAiUsd: number;
}

/**
 * Computes platform-level (cross-tenant) analytics for the superadmin console:
 * recurring revenue, plan mix, and AI cost. It reads every organization's
 * subscription — a system-only aggregation that lives here (not in the
 * tenant-scoped billing service) and is only ever exposed to platform admins.
 *
 * Revenue counts only ACTIVE organizations on an ACTIVE plan; a suspended org
 * or a canceled subscription contributes nothing. An org with no stored
 * subscription is treated as the default (entry) plan, matching how the
 * billing service synthesizes a default subscription.
 */
export class PlatformAnalyticsService {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly subscriptions: SubscriptionRepository,
    private readonly aiUsage?: AiUsageRepository,
  ) {}

  async summary(): Promise<PlatformAnalyticsSummary> {
    const [orgs, subs] =
      await Promise.all([
        this.organizations.list(),
        this.subscriptions.listAll(),
      ]);

    const subByOrg = new Map(
      subs.map((s) => [
        s.organizationId,
        s,
      ]),
    );

    let mrrCents = 0;
    let activeSubscriptions = 0;
    const byPlan = new Map<
      string,
      { count: number; mrrCents: number }
    >();

    for (const org of orgs) {
      // A suspended (or otherwise non-active) org is not billable revenue.
      if (org.status !== "active") {
        continue;
      }

      const sub = subByOrg.get(org.id);
      const status =
        sub?.status ?? "active";
      if (status !== "active") {
        continue;
      }

      const plan =
        getPlan(
          sub?.planId ??
            defaultPlan().id,
        ) ?? defaultPlan();
      // Enterprise has custom pricing (priceCents null) → 0 toward MRR.
      const cents = plan.priceCents ?? 0;

      mrrCents += cents;
      activeSubscriptions += 1;

      const entry = byPlan.get(
        plan.id,
      ) ?? {
        count: 0,
        mrrCents: 0,
      };
      entry.count += 1;
      entry.mrrCents += cents;
      byPlan.set(plan.id, entry);
    }

    const aiPlatformCostMicros =
      await this.platformAiCostMTD();

    const mrrUsd = mrrCents / 100;
    const aiPlatformCostUsdMTD =
      aiPlatformCostMicros / 1_000_000;

    return {
      totalOrganizations: orgs.length,
      activeOrganizations: orgs.filter(
        (o) => o.status === "active",
      ).length,
      suspendedOrganizations:
        orgs.filter(
          (o) =>
            o.status === "suspended",
        ).length,
      activeSubscriptions,
      mrrUsd,
      arrUsd: (mrrCents * 12) / 100,
      byPlan: [...byPlan.entries()]
        .map(([planId, v]) => ({
          planId,
          name:
            getPlan(planId)?.name ??
            planId,
          count: v.count,
          mrrUsd: v.mrrCents / 100,
        }))
        .sort(
          (a, b) => b.mrrUsd - a.mrrUsd,
        ),
      aiPlatformCostUsdMTD,
      netAfterAiUsd:
        mrrUsd - aiPlatformCostUsdMTD,
    };
  }

  /** Platform-borne AI cost (micro-dollars) since the start of this UTC month. */
  private async platformAiCostMTD(): Promise<number> {
    if (!this.aiUsage) {
      return 0;
    }

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1,
      ),
    ).toISOString();

    try {
      return await this.aiUsage.platformCostSinceAll(
        monthStart,
      );
    } catch {
      return 0;
    }
  }
}
