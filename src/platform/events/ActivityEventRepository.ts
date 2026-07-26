import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  ActivityActorType,
  ActivityEventRecord,
  ActivitySubjectType,
} from "./ActivityEvent";

interface EventRow {
  id: string;
  organization_id: string;
  type: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  subject_type: string | null;
  subject_id: string | null;
  title: string;
  summary: string | null;
  metadata: unknown;
  created_at: string;
}

export interface ActivityQuery {
  subjectType?: string;
  subjectId?: string;
  limit?: number;
}

/**
 * Stores the tenant activity log. Every read is scoped to the acting
 * organization, so one tenant's timeline can never surface another's.
 */
export class ActivityEventRepository extends TenantScopedRepository {
  private readonly memory: ActivityEventRecord[] =
    [];

  async create(
    record: Omit<
      ActivityEventRecord,
      "organizationId"
    >,
  ): Promise<ActivityEventRecord> {
    const organizationId =
      this.tenantId();
    const full: ActivityEventRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO activity_events
           (id, organization_id, type, actor_type, actor_id, actor_name,
            subject_type, subject_id, title, summary, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          full.id,
          full.organizationId,
          full.type,
          full.actorType,
          full.actorId ?? null,
          full.actorName ?? null,
          full.subjectType ?? null,
          full.subjectId ?? null,
          full.title,
          full.summary ?? null,
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
    query: ActivityQuery = {},
  ): Promise<ActivityEventRecord[]> {
    const organizationId =
      this.tenantId();
    const limit = Math.min(
      Math.max(query.limit ?? 100, 1),
      500,
    );

    if (this.db) {
      const clauses = [
        "organization_id = $1",
      ];
      const params: unknown[] = [
        organizationId,
      ];

      if (query.subjectType) {
        params.push(query.subjectType);
        clauses.push(
          `subject_type = $${params.length}`,
        );
      }

      if (query.subjectId) {
        params.push(query.subjectId);
        clauses.push(
          `subject_id = $${params.length}`,
        );
      }

      params.push(limit);

      const result =
        await this.db.query(
          `SELECT * FROM activity_events
            WHERE ${clauses.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT $${params.length}`,
          params,
        );

      return (
        result.rows as unknown as EventRow[]
      ).map(mapRow);
    }

    return this.memory
      .filter(
        (e) =>
          e.organizationId ===
            organizationId &&
          (!query.subjectType ||
            e.subjectType ===
              query.subjectType) &&
          (!query.subjectId ||
            e.subjectId ===
              query.subjectId),
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      )
      .slice(0, limit);
  }
}

function mapRow(
  row: EventRow,
): ActivityEventRecord {
  const record: ActivityEventRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    type: row.type,
    actorType:
      row.actor_type as ActivityActorType,
    title: row.title,
    createdAt: row.created_at,
  };

  if (row.actor_id)
    record.actorId = row.actor_id;
  if (row.actor_name)
    record.actorName = row.actor_name;
  if (row.subject_type)
    record.subjectType =
      row.subject_type as ActivitySubjectType;
  if (row.subject_id)
    record.subjectId = row.subject_id;
  if (row.summary)
    record.summary = row.summary;

  record.metadata =
    parseMetadata(row.metadata);

  return record;
}

function parseMetadata(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object"
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {};
}
