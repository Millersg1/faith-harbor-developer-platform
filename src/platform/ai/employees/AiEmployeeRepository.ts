import { TenantScopedRepository } from "../../../tenancy/TenantScopedRepository";
import type {
  AiEmployeeRecord,
  AiEmployeeStatus,
} from "./AiEmployeeTypes";

interface EmployeeRow {
  id: string;
  organization_id: string;
  name: string;
  title: string;
  persona: string;
  tool_names: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Stores AI employees — tenant-scoped. */
export class AiEmployeeRepository extends TenantScopedRepository {
  private readonly rows = new Map<
    string,
    AiEmployeeRecord
  >();

  async create(
    record: Omit<
      AiEmployeeRecord,
      "organizationId"
    >,
  ): Promise<AiEmployeeRecord> {
    const full: AiEmployeeRecord = {
      ...record,
      organizationId:
        this.tenantId(),
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO ai_employees
           (id, organization_id, name, title, persona, tool_names,
            status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          full.id,
          full.organizationId,
          full.name,
          full.title,
          full.persona,
          JSON.stringify(
            full.toolNames,
          ),
          full.status,
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
    AiEmployeeRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM ai_employees WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | EmployeeRow
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

  async list(): Promise<
    AiEmployeeRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM ai_employees
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return (
        result.rows as unknown as EmployeeRow[]
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
      );
  }

  async update(
    record: AiEmployeeRecord,
  ): Promise<AiEmployeeRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE ai_employees
            SET name = $3, title = $4, persona = $5, tool_names = $6,
                status = $7, updated_at = $8
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.name,
          record.title,
          record.persona,
          JSON.stringify(
            record.toolNames,
          ),
          record.status,
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

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM ai_employees WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const record = this.rows.get(id);
    if (
      record &&
      record.organizationId ===
        organizationId
    ) {
      this.rows.delete(id);
    }
  }
}

function map(
  row: EmployeeRow,
): AiEmployeeRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    name: row.name,
    title: row.title,
    persona: row.persona,
    toolNames: parseNames(
      row.tool_names,
    ),
    status:
      row.status as AiEmployeeStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseNames(
  value: unknown,
): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is string =>
        typeof v === "string",
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed.filter(
            (v): v is string =>
              typeof v === "string",
          )
        : [];
    } catch {
      return [];
    }
  }

  return [];
}
