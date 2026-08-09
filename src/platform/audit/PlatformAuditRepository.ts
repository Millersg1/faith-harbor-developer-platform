import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * A durable, tenant-NEUTRAL platform audit event. Deliberately stores only
 * compact enums + identifiers — never names, emails, descriptions, notes, or
 * tokens. Distinct from tenant-scoped `audit_events`, which requires an
 * organization id and cannot record org-neutral platform-admin actions.
 */
export interface PlatformAuditEventRecord {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  outcome: "success" | "failure" | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Row {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  outcome: string | null;
  metadata: unknown;
  created_at: string;
}

/**
 * Append-only store for platform-level audit events. No update or delete — an
 * audit trail must be tamper-evident. In memory for tests; Postgres otherwise.
 */
export class PlatformAuditRepository {
  private readonly memory: PlatformAuditEventRecord[] = [];

  constructor(private readonly db?: PgQueryable) {}

  async create(
    record: PlatformAuditEventRecord,
  ): Promise<PlatformAuditEventRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO platform_audit_events
           (id, action, actor_type, actor_id, target_type, target_id,
            outcome, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          record.id,
          record.action,
          record.actorType,
          record.actorId,
          record.targetType,
          record.targetId,
          record.outcome,
          JSON.stringify(record.metadata ?? {}),
          record.createdAt,
        ],
      );
      return record;
    }
    this.memory.push(record);
    return record;
  }

  async list(limit = 100): Promise<PlatformAuditEventRecord[]> {
    const capped = Math.min(Math.max(limit, 1), 500);
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM platform_audit_events
          ORDER BY created_at DESC LIMIT $1`,
        [capped],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return this.memory
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, capped);
  }

  async listForTarget(
    targetType: string,
    targetId: string,
    limit = 100,
  ): Promise<PlatformAuditEventRecord[]> {
    const capped = Math.min(Math.max(limit, 1), 500);
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM platform_audit_events
          WHERE target_type=$1 AND target_id=$2
          ORDER BY created_at DESC LIMIT $3`,
        [targetType, targetId, capped],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return this.memory
      .filter((e) => e.targetType === targetType && e.targetId === targetId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, capped);
  }
}

function mapRow(row: Row): PlatformAuditEventRecord {
  let metadata: Record<string, unknown> = {};
  if (row.metadata && typeof row.metadata === "object") {
    metadata = row.metadata as Record<string, unknown>;
  } else if (typeof row.metadata === "string") {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = {};
    }
  }
  return {
    id: row.id,
    action: row.action,
    actorType: row.actor_type,
    actorId: row.actor_id,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome:
      row.outcome === "success" || row.outcome === "failure"
        ? row.outcome
        : null,
    metadata,
    createdAt: row.created_at,
  };
}
