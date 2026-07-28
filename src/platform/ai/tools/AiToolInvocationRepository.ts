import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type {
  AiToolInvocationRecord,
  AiToolInvocationStatus,
  AiToolMode,
} from "./AiToolTypes";

interface InvocationRow {
  id: string;
  organization_id: string;
  tool_name: string;
  mode: string;
  args: unknown;
  status: string;
  summary: string | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Stores AI tool invocations (read history + pending write proposals). */
export class AiToolInvocationRepository extends TenantScopedRepository {
  private readonly rows = new Map<
    string,
    AiToolInvocationRecord
  >();

  async create(
    record: Omit<
      AiToolInvocationRecord,
      "organizationId"
    >,
  ): Promise<AiToolInvocationRecord> {
    const full: AiToolInvocationRecord =
      {
        ...record,
        organizationId:
          this.tenantId(),
      };

    if (this.db) {
      await this.db.query(
        `INSERT INTO ai_tool_invocations
           (id, organization_id, tool_name, mode, args, status,
            summary, requested_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          full.id,
          full.organizationId,
          full.toolName,
          full.mode,
          JSON.stringify(full.args),
          full.status,
          full.summary ?? null,
          full.requestedBy ?? null,
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.rows.set(full.id, full);

    return full;
  }

  async get(
    id: string,
  ): Promise<
    AiToolInvocationRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM ai_tool_invocations WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | InvocationRow
        | undefined;

      return row ? map(row) : undefined;
    }

    const record = this.rows.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async update(
    record: AiToolInvocationRecord,
  ): Promise<AiToolInvocationRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE ai_tool_invocations
            SET status = $3, summary = $4, updated_at = $5
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.status,
          record.summary ?? null,
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.rows.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.rows.set(
        record.id,
        record,
      );
    }

    return record;
  }

  /**
   * Atomically claims a PENDING invocation for execution — flips it to
   * "executing" only if it is currently pending and (when maxAgeMs is given)
   * not expired. Returns the claimed record, or undefined if it was already
   * handled/expired. This is the single-execution guard: two concurrent
   * confirms cannot both claim the same proposal, so a write never runs twice.
   */
  async claimPending(
    id: string,
    maxAgeMs?: number,
  ): Promise<
    AiToolInvocationRecord | undefined
  > {
    const organizationId =
      this.tenantId();
    const now =
      new Date().toISOString();

    if (this.db) {
      const cutoff = maxAgeMs
        ? new Date(
            Date.now() - maxAgeMs,
          ).toISOString()
        : null;
      const result =
        await this.db.query(
          `UPDATE ai_tool_invocations
              SET status = 'executing', updated_at = $3
            WHERE id = $1 AND organization_id = $2 AND status = 'pending'
              AND ($4::text IS NULL OR created_at >= $4)
          RETURNING *`,
          [
            id,
            organizationId,
            now,
            cutoff,
          ],
        );
      const row = result
        .rows[0] as unknown as
        | InvocationRow
        | undefined;
      return row ? map(row) : undefined;
    }

    const record = this.rows.get(id);
    if (
      !record ||
      record.organizationId !==
        organizationId ||
      record.status !== "pending" ||
      (maxAgeMs &&
        Date.parse(record.createdAt) <
          Date.now() - maxAgeMs)
    ) {
      return undefined;
    }
    const claimed: AiToolInvocationRecord =
      {
        ...record,
        status: "executing",
        updatedAt: now,
      };
    this.rows.set(id, claimed);
    return claimed;
  }

  async list(
    limit = 50,
  ): Promise<AiToolInvocationRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM ai_tool_invocations
            WHERE organization_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
          [organizationId, limit],
        );

      return (
        result.rows as unknown as InvocationRow[]
      ).map(map);
    }

    return [...this.rows.values()]
      .filter(
        (r) =>
          r.organizationId ===
          organizationId,
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      )
      .slice(0, limit);
  }
}

function map(
  row: InvocationRow,
): AiToolInvocationRecord {
  const record: AiToolInvocationRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      toolName: row.tool_name,
      mode: row.mode as AiToolMode,
      args: parseArgs(row.args),
      status:
        row.status as AiToolInvocationStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.summary)
    record.summary = row.summary;
  if (row.requested_by)
    record.requestedBy =
      row.requested_by;

  return record;
}

function parseArgs(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return parsed &&
        typeof parsed === "object"
        ? (parsed as Record<
            string,
            unknown
          >)
        : {};
    } catch {
      return {};
    }
  }

  return {};
}
