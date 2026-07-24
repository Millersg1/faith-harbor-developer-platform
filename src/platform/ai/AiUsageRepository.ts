import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  AiUsageEventRecord,
  AiUsageSummary,
} from "./AiUsageEvent";

interface UsageRow {
  id: string;
  organization_id: string;
  kind: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  own_key: boolean | number;
  created_at: string;
}

/**
 * Records and summarizes AI usage, always scoped to the current tenant. A
 * tenant can only ever see its own usage.
 */
export class AiUsageRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      AiUsageEventRecord
    >();

  async record(
    event: Omit<
      AiUsageEventRecord,
      "organizationId"
    >,
  ): Promise<AiUsageEventRecord> {
    const organizationId =
      this.tenantId();

    const record: AiUsageEventRecord =
      { ...event, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO ai_usage_events
           (id, organization_id, kind, provider, model,
            input_tokens, output_tokens, cost_micros, own_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.organizationId,
          record.kind,
          record.provider,
          record.model,
          record.inputTokens,
          record.outputTokens,
          record.costMicros,
          record.ownKey,
          record.createdAt,
        ],
      );

      return record;
    }

    this.memory.set(
      record.id,
      record,
    );

    return record;
  }

  /**
   * Summarizes usage for the current tenant since `sinceIso` (inclusive).
   */
  async summarySince(
    sinceIso: string,
  ): Promise<AiUsageSummary> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT
             COUNT(*)                                             AS generations,
             COALESCE(SUM(input_tokens), 0)                      AS input_tokens,
             COALESCE(SUM(output_tokens), 0)                     AS output_tokens,
             COALESCE(SUM(cost_micros), 0)                       AS cost_micros,
             COALESCE(SUM(CASE WHEN own_key THEN 0 ELSE cost_micros END), 0) AS platform_cost_micros
           FROM ai_usage_events
           WHERE organization_id = $1 AND created_at >= $2`,
          [organizationId, sinceIso],
        );

      const row = result.rows[0] as
        | Record<string, unknown>
        | undefined;

      return {
        generations: Number(
          row?.generations ?? 0,
        ),
        inputTokens: Number(
          row?.input_tokens ?? 0,
        ),
        outputTokens: Number(
          row?.output_tokens ?? 0,
        ),
        costMicros: Number(
          row?.cost_micros ?? 0,
        ),
        platformCostMicros: Number(
          row?.platform_cost_micros ??
            0,
        ),
      };
    }

    const events = Array.from(
      this.memory.values(),
    ).filter(
      (e) =>
        e.organizationId ===
          organizationId &&
        e.createdAt >= sinceIso,
    );

    return events.reduce<AiUsageSummary>(
      (acc, e) => ({
        generations:
          acc.generations + 1,
        inputTokens:
          acc.inputTokens +
          e.inputTokens,
        outputTokens:
          acc.outputTokens +
          e.outputTokens,
        costMicros:
          acc.costMicros +
          e.costMicros,
        platformCostMicros:
          acc.platformCostMicros +
          (e.ownKey
            ? 0
            : e.costMicros),
      }),
      {
        generations: 0,
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        platformCostMicros: 0,
      },
    );
  }

  /** Counts the current tenant's events of a kind since `sinceIso`. */
  async countSince(
    kind: string,
    sinceIso: string,
  ): Promise<number> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT COUNT(*) AS n FROM ai_usage_events
           WHERE organization_id = $1 AND kind = $2 AND created_at >= $3`,
          [
            organizationId,
            kind,
            sinceIso,
          ],
        );

      return Number(
        (
          result.rows[0] as
            | Record<string, unknown>
            | undefined
        )?.n ?? 0,
      );
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (e) =>
        e.organizationId ===
          organizationId &&
        e.kind === kind &&
        e.createdAt >= sinceIso,
    ).length;
  }

  /**
   * Counts only PLATFORM-key events (own_key = false) of a kind since
   * `sinceIso` — i.e. usage that counts against the plan's included AI
   * allowance. Tenant-key usage is the tenant's own spend and isn't counted.
   */
  async platformCountSince(
    kind: string,
    sinceIso: string,
  ): Promise<number> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT COUNT(*) AS n FROM ai_usage_events
           WHERE organization_id = $1 AND kind = $2
             AND created_at >= $3 AND own_key = FALSE`,
          [
            organizationId,
            kind,
            sinceIso,
          ],
        );

      return Number(
        (
          result.rows[0] as
            | Record<string, unknown>
            | undefined
        )?.n ?? 0,
      );
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (e) =>
        e.organizationId ===
          organizationId &&
        e.kind === kind &&
        e.createdAt >= sinceIso &&
        !e.ownKey,
    ).length;
  }
}
