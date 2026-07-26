import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { CalendarEventRecord } from "./CalendarEvent";

interface EventRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  subject_type: string | null;
  subject_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarQuery {
  from?: string;
  to?: string;
}

/**
 * Stores calendar events, always scoped to the acting tenant.
 */
export class CalendarEventRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<string, CalendarEventRecord>();

  async create(
    record: Omit<
      CalendarEventRecord,
      "organizationId"
    >,
  ): Promise<CalendarEventRecord> {
    const organizationId =
      this.tenantId();
    const full: CalendarEventRecord =
      { ...record, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO calendar_events
           (id, organization_id, title, description, location, start_at,
            end_at, all_day, subject_type, subject_id, created_by,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          full.id,
          full.organizationId,
          full.title,
          full.description ?? null,
          full.location ?? null,
          full.startAt,
          full.endAt ?? null,
          full.allDay,
          full.subjectType ?? null,
          full.subjectId ?? null,
          full.createdBy ?? null,
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.memory.set(full.id, full);

    return full;
  }

  async get(
    id: string,
  ): Promise<
    CalendarEventRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM calendar_events WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | EventRow
        | undefined;

      return row
        ? mapRow(row)
        : undefined;
    }

    const record =
      this.memory.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(
    query: CalendarQuery = {},
  ): Promise<CalendarEventRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const clauses = [
        "organization_id = $1",
      ];
      const params: unknown[] = [
        organizationId,
      ];

      if (query.from) {
        params.push(query.from);
        clauses.push(
          `start_at >= $${params.length}`,
        );
      }

      if (query.to) {
        params.push(query.to);
        clauses.push(
          `start_at <= $${params.length}`,
        );
      }

      const result =
        await this.db.query(
          `SELECT * FROM calendar_events
            WHERE ${clauses.join(" AND ")}
            ORDER BY start_at ASC
            LIMIT 1000`,
          params,
        );

      return (
        result.rows as unknown as EventRow[]
      ).map(mapRow);
    }

    return [...this.memory.values()]
      .filter(
        (e) =>
          e.organizationId ===
            organizationId &&
          (!query.from ||
            e.startAt >=
              query.from) &&
          (!query.to ||
            e.startAt <= query.to),
      )
      .sort((a, b) =>
        a.startAt < b.startAt
          ? -1
          : 1,
      );
  }

  async update(
    record: CalendarEventRecord,
  ): Promise<CalendarEventRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE calendar_events
            SET title = $3, description = $4, location = $5, start_at = $6,
                end_at = $7, all_day = $8, updated_at = $9
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.title,
          record.description ?? null,
          record.location ?? null,
          record.startAt,
          record.endAt ?? null,
          record.allDay,
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.memory.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.memory.set(
        record.id,
        record,
      );
    }

    return record;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM calendar_events WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const record =
      this.memory.get(id);

    if (
      record &&
      record.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function mapRow(
  row: EventRow,
): CalendarEventRecord {
  const record: CalendarEventRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    title: row.title,
    startAt: row.start_at,
    allDay: Boolean(row.all_day),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.description)
    record.description =
      row.description;
  if (row.location)
    record.location = row.location;
  if (row.end_at)
    record.endAt = row.end_at;
  if (row.subject_type)
    record.subjectType =
      row.subject_type;
  if (row.subject_id)
    record.subjectId = row.subject_id;
  if (row.created_by)
    record.createdBy =
      row.created_by;

  return record;
}
