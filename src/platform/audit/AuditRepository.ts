import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  AuditActorType,
  AuditEventRecord,
} from "./AuditEvent";

interface AuditRow {
  id: string;
  organization_id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  outcome: string | null;
  ip: string | null;
  metadata: unknown;
  created_at: string;
}

/**
 * Append-only store for audit events, scoped to the acting tenant. There is
 * deliberately no update or delete — an audit trail must be tamper-evident.
 */
export class AuditRepository extends TenantScopedRepository {
  private readonly memory: AuditEventRecord[] =
    [];

  async create(
    record: Omit<
      AuditEventRecord,
      "organizationId"
    >,
  ): Promise<AuditEventRecord> {
    const organizationId =
      this.tenantId();
    const full: AuditEventRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO audit_events
           (id, organization_id, action, actor_type, actor_id, actor_label,
            target_type, target_id, outcome, ip, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          full.id,
          full.organizationId,
          full.action,
          full.actorType,
          full.actorId ?? null,
          full.actorLabel ?? null,
          full.targetType ?? null,
          full.targetId ?? null,
          full.outcome ?? null,
          full.ip ?? null,
          JSON.stringify(
            full.metadata ?? {},
          ),
          full.createdAt,
        ],
      );

      return full;
    }

    this.memory.push(full);

    return full;
  }

  async list(
    limit = 100,
  ): Promise<AuditEventRecord[]> {
    const organizationId =
      this.tenantId();
    const capped = Math.min(
      Math.max(limit, 1),
      500,
    );

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM audit_events
            WHERE organization_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
          [organizationId, capped],
        );

      return (
        result.rows as unknown as AuditRow[]
      ).map(mapRow);
    }

    return this.memory
      .filter(
        (e) =>
          e.organizationId ===
          organizationId,
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      )
      .slice(0, capped);
  }
}

function mapRow(
  row: AuditRow,
): AuditEventRecord {
  const record: AuditEventRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    action: row.action,
    actorType:
      row.actor_type as AuditActorType,
    createdAt: row.created_at,
  };

  if (row.actor_id)
    record.actorId = row.actor_id;
  if (row.actor_label)
    record.actorLabel =
      row.actor_label;
  if (row.target_type)
    record.targetType =
      row.target_type;
  if (row.target_id)
    record.targetId = row.target_id;
  if (
    row.outcome === "success" ||
    row.outcome === "failure"
  )
    record.outcome = row.outcome;
  if (row.ip) record.ip = row.ip;

  record.metadata = parseMeta(
    row.metadata,
  );

  return record;
}

function parseMeta(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object"
  )
    return value as Record<
      string,
      unknown
    >;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}
