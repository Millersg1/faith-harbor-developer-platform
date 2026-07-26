import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { PlatformFileRecord } from "./PlatformFile";

interface FileRow {
  id: string;
  organization_id: string;
  name: string;
  stored_key: string;
  mime_type: string;
  size: number;
  tags: unknown;
  subject_type: string | null;
  subject_id: string | null;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ListFilesOptions {
  subjectType?: string;
  subjectId?: string;
  includeDeleted?: boolean;
}

/**
 * Stores file metadata, always scoped to the acting tenant. A file created
 * by one organization can never be listed, read, or deleted by another.
 */
export class PlatformFileRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<string, PlatformFileRecord>();

  async create(
    record: Omit<
      PlatformFileRecord,
      "organizationId"
    >,
  ): Promise<PlatformFileRecord> {
    const organizationId =
      this.tenantId();
    const full: PlatformFileRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO files
           (id, organization_id, name, stored_key, mime_type, size,
            tags, subject_type, subject_id, uploaded_by, deleted_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          full.id,
          full.organizationId,
          full.name,
          full.storedKey,
          full.mimeType,
          full.size,
          JSON.stringify(
            full.tags ?? [],
          ),
          full.subjectType ?? null,
          full.subjectId ?? null,
          full.uploadedBy ?? null,
          full.deletedAt ?? null,
          full.createdAt,
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
    PlatformFileRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM files WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | FileRow
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
    options: ListFilesOptions = {},
  ): Promise<PlatformFileRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const clauses = [
        "organization_id = $1",
      ];
      const params: unknown[] = [
        organizationId,
      ];

      if (!options.includeDeleted) {
        clauses.push(
          "deleted_at IS NULL",
        );
      }

      if (options.subjectType) {
        params.push(
          options.subjectType,
        );
        clauses.push(
          `subject_type = $${params.length}`,
        );
      }

      if (options.subjectId) {
        params.push(
          options.subjectId,
        );
        clauses.push(
          `subject_id = $${params.length}`,
        );
      }

      const result =
        await this.db.query(
          `SELECT * FROM files
            WHERE ${clauses.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT 500`,
          params,
        );

      return (
        result.rows as unknown as FileRow[]
      ).map(mapRow);
    }

    return [...this.memory.values()]
      .filter(
        (f) =>
          f.organizationId ===
            organizationId &&
          (options.includeDeleted ||
            !f.deletedAt) &&
          (!options.subjectType ||
            f.subjectType ===
              options.subjectType) &&
          (!options.subjectId ||
            f.subjectId ===
              options.subjectId),
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      );
  }

  async update(
    record: PlatformFileRecord,
  ): Promise<PlatformFileRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE files
            SET name = $3, tags = $4, deleted_at = $5
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.name,
          JSON.stringify(
            record.tags ?? [],
          ),
          record.deletedAt ?? null,
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

  /** Total live (non-deleted) bytes for the tenant — for quota checks. */
  async totalSize(): Promise<number> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT COALESCE(SUM(size),0)::bigint AS total
             FROM files
            WHERE organization_id = $1 AND deleted_at IS NULL`,
          [organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | { total: string | number }
        | undefined;

      return row
        ? Number(row.total)
        : 0;
    }

    return [...this.memory.values()]
      .filter(
        (f) =>
          f.organizationId ===
            organizationId &&
          !f.deletedAt,
      )
      .reduce(
        (sum, f) => sum + f.size,
        0,
      );
  }
}

function mapRow(
  row: FileRow,
): PlatformFileRecord {
  const record: PlatformFileRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    name: row.name,
    storedKey: row.stored_key,
    mimeType: row.mime_type,
    size: Number(row.size),
    tags: parseTags(row.tags),
    createdAt: row.created_at,
  };

  if (row.subject_type)
    record.subjectType =
      row.subject_type;
  if (row.subject_id)
    record.subjectId = row.subject_id;
  if (row.uploaded_by)
    record.uploadedBy =
      row.uploaded_by;
  if (row.deleted_at)
    record.deletedAt = row.deleted_at;

  return record;
}

function parseTags(
  value: unknown,
): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    try {
      const parsed =
        JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed.map(String)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}
