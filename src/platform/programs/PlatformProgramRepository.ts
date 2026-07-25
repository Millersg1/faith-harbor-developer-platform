import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformProgramRecord,
  PlatformProgramStatus,
} from "./PlatformProgram";

interface ProgramRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  category: string | null;
  status: string;
  leader: string | null;
  schedule: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores programs, always scoped to the current tenant.
 */
export class PlatformProgramRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformProgramRecord
    >();

  async create(
    program: Omit<
      PlatformProgramRecord,
      "organizationId"
    >,
  ): Promise<PlatformProgramRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformProgramRecord =
      { ...program, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO programs
           (id, organization_id, client_id, name, category, status,
            leader, schedule, description, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.name,
          record.category ?? null,
          record.status,
          record.leader ?? null,
          record.schedule ?? null,
          record.description ?? null,
          record.notes ?? null,
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
    PlatformProgramRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM programs WHERE id = $1 AND organization_id = $2",
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
    PlatformProgramRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM programs
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is ProgramRow =>
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
    program: PlatformProgramRecord,
  ): Promise<PlatformProgramRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE programs
            SET client_id = $3, name = $4, category = $5, status = $6,
                leader = $7, schedule = $8, description = $9, notes = $10,
                updated_at = $11
          WHERE id = $1 AND organization_id = $2`,
        [
          program.id,
          organizationId,
          program.clientId ?? null,
          program.name,
          program.category ?? null,
          program.status,
          program.leader ?? null,
          program.schedule ?? null,
          program.description ?? null,
          program.notes ?? null,
          program.updatedAt,
        ],
      );

      return program;
    }

    const existing = this.memory.get(
      program.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        program.id,
        program,
      );
    }

    return program;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM programs WHERE id = $1 AND organization_id = $2",
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
): ProgramRow | undefined {
  return row as ProgramRow | undefined;
}

function mapRow(
  row: ProgramRow,
): PlatformProgramRecord {
  const record: PlatformProgramRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      status:
        row.status as PlatformProgramStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.category)
    record.category = row.category;
  if (row.leader)
    record.leader = row.leader;
  if (row.schedule)
    record.schedule = row.schedule;
  if (row.description)
    record.description =
      row.description;
  if (row.notes)
    record.notes = row.notes;

  return record;
}
