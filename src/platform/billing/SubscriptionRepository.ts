import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { OrganizationSubscriptionRecord } from "./OrganizationSubscription";

interface SubscriptionRow {
  organization_id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: string;
}

/**
 * Stores one subscription per tenant, keyed by the organization. Reads and
 * writes are scoped to the current tenant, so a tenant can only ever see or
 * change its own subscription.
 */
export class SubscriptionRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      OrganizationSubscriptionRecord
    >();

  async get(): Promise<
    OrganizationSubscriptionRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organization_subscriptions WHERE organization_id = $1",
          [organizationId],
        );

      const row = result.rows[0] as
        | unknown as
        | SubscriptionRow
        | undefined;

      return row
        ? mapRow(row)
        : undefined;
    }

    return this.memory.get(
      organizationId,
    );
  }

  /**
   * Inserts or replaces the current tenant's subscription. The
   * organization id comes from the tenant context, never the record.
   */
  async upsert(
    subscription: Omit<
      OrganizationSubscriptionRecord,
      "organizationId"
    >,
  ): Promise<OrganizationSubscriptionRecord> {
    const organizationId =
      this.tenantId();

    const record: OrganizationSubscriptionRecord =
      { ...subscription, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO organization_subscriptions
           (organization_id, plan_id, status, current_period_end,
            stripe_customer_id, stripe_subscription_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           current_period_end = EXCLUDED.current_period_end,
           stripe_customer_id = EXCLUDED.stripe_customer_id,
           stripe_subscription_id = EXCLUDED.stripe_subscription_id,
           updated_at = EXCLUDED.updated_at`,
        [
          record.organizationId,
          record.planId,
          record.status,
          record.currentPeriodEnd,
          record.stripeCustomerId,
          record.stripeSubscriptionId,
          record.updatedAt,
        ],
      );

      return record;
    }

    this.memory.set(
      organizationId,
      record,
    );

    return record;
  }
}

function mapRow(
  row: SubscriptionRow,
): OrganizationSubscriptionRecord {
  return {
    organizationId:
      row.organization_id,
    planId: row.plan_id,
    status:
      row.status as OrganizationSubscriptionRecord["status"],
    currentPeriodEnd:
      row.current_period_end,
    stripeCustomerId:
      row.stripe_customer_id,
    stripeSubscriptionId:
      row.stripe_subscription_id,
    updatedAt: row.updated_at,
  };
}
