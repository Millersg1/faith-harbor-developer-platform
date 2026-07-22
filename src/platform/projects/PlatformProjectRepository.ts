import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformProjectRecord,
  PlatformProjectStatus,
} from "./PlatformProject";

interface ProjectRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores projects, always scoped to the current tenant. Same isolation
 * contract as every tenant-scoped repository: resolve the organization
 * from context (fail closed) and constrain every query to it.
 */
export class PlatformProjectRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformProjectRecord
    >();

  async create(
    project: Omit<
      PlatformProjectRecord,
      "organizationId"
    >,
  ): Promise<PlatformProjectRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformProjectRecord =
      { ...project, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO projects
           (id, organization_id, client_id, name, description,
            status, due_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.name,
          record.description ?? null,
          record.status,
          record.dueDate ?? null,
          record.createdAt,
          record.updatedAt,
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

  async get(
    id: string,
  ): Promise<
    PlatformProjectRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM projects WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    const record = this.memory.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(): Promise<
    PlatformProjectRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM projects
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is ProjectRow =>
            row !== undefined,
        )
        .map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (record) =>
        record.organizationId ===
        organizationId,
    );
  }

  async update(
    project: PlatformProjectRecord,
  ): Promise<PlatformProjectRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE projects
            SET client_id = $3, name = $4, description = $5,
                status = $6, due_date = $7, updated_at = $8
          WHERE id = $1 AND organization_id = $2`,
        [
          project.id,
          organizationId,
          project.clientId ?? null,
          project.name,
          project.description ?? null,
          project.status,
          project.dueDate ?? null,
          project.updatedAt,
        ],
      );

      return project;
    }

    const existing = this.memory.get(
      project.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        project.id,
        project,
      );
    }

    return project;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM projects WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing = this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): ProjectRow | undefined {
  return row as ProjectRow | undefined;
}

function mapRow(
  row: ProjectRow,
): PlatformProjectRecord {
  const record: PlatformProjectRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      status:
        row.status as PlatformProjectStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id) {
    record.clientId = row.client_id;
  }

  if (row.description) {
    record.description =
      row.description;
  }

  if (row.due_date) {
    record.dueDate = row.due_date;
  }

  return record;
}
