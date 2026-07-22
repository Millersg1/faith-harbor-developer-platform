import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformClientRecord,
  PlatformClientStatus,
} from "./PlatformClient";

interface ClientRow {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  company: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores platform clients, always scoped to the current tenant.
 *
 * Every method resolves the organization from the tenant context (fail
 * closed) and constrains its query to that organization, so one tenant
 * can never read, change, or delete another tenant's clients. In memory
 * without a database (tests); Postgres when a query surface is supplied.
 */
export class PlatformClientRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<string, PlatformClientRecord>();

  /**
   * Creates a client in the current organization. The tenant id is
   * stamped from context — it cannot be supplied by the caller.
   */
  async create(
    client: Omit<
      PlatformClientRecord,
      "organizationId"
    >,
  ): Promise<PlatformClientRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformClientRecord =
      { ...client, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO clients
           (id, organization_id, name, email, company, status,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.id,
          record.organizationId,
          record.name,
          record.email ?? null,
          record.company ?? null,
          record.status,
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
    PlatformClientRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM clients WHERE id = $1 AND organization_id = $2",
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

    // Cross-tenant reads return nothing, exactly as if the row were
    // owned by no one the caller can see.
    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(): Promise<
    PlatformClientRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM clients
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (row): row is ClientRow =>
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
    client: PlatformClientRecord,
  ): Promise<PlatformClientRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE clients
            SET name = $3, email = $4, company = $5,
                status = $6, updated_at = $7
          WHERE id = $1 AND organization_id = $2`,
        [
          client.id,
          organizationId,
          client.name,
          client.email ?? null,
          client.company ?? null,
          client.status,
          client.updatedAt,
        ],
      );

      return client;
    }

    const existing = this.memory.get(
      client.id,
    );

    // Only touch the record if it belongs to the acting tenant.
    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        client.id,
        client,
      );
    }

    return client;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM clients WHERE id = $1 AND organization_id = $2",
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

/**
 * Narrows a raw Postgres row to our row shape (the `| undefined` on the
 * parameter gives the cast enough overlap to be allowed).
 */
function asRow(
  row: Record<string, unknown> | undefined,
): ClientRow | undefined {
  return row as ClientRow | undefined;
}

function mapRow(
  row: ClientRow,
): PlatformClientRecord {
  const record: PlatformClientRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      status:
        row.status as PlatformClientStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.email) {
    record.email = row.email;
  }

  if (row.company) {
    record.company = row.company;
  }

  return record;
}
