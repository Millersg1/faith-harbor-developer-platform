import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformHostingAccountRecord,
  PlatformHostingStatus,
} from "./PlatformHostingAccount";

interface HostingRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  domain: string;
  plan: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores hosting accounts, always scoped to the current tenant. Same
 * isolation contract as every tenant-scoped repository: resolve the
 * organization from context (fail closed) and constrain every query to it.
 */
export class PlatformHostingRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformHostingAccountRecord
    >();

  async create(
    account: Omit<
      PlatformHostingAccountRecord,
      "organizationId"
    >,
  ): Promise<PlatformHostingAccountRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformHostingAccountRecord =
      { ...account, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO hosting_accounts
           (id, organization_id, client_id, domain, plan,
            status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.domain,
          record.plan ?? null,
          record.status,
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
    PlatformHostingAccountRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM hosting_accounts WHERE id = $1 AND organization_id = $2",
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
    PlatformHostingAccountRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM hosting_accounts
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is HostingRow =>
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
    account: PlatformHostingAccountRecord,
  ): Promise<PlatformHostingAccountRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE hosting_accounts
            SET client_id = $3, domain = $4, plan = $5,
                status = $6, notes = $7, updated_at = $8
          WHERE id = $1 AND organization_id = $2`,
        [
          account.id,
          organizationId,
          account.clientId ?? null,
          account.domain,
          account.plan ?? null,
          account.status,
          account.notes ?? null,
          account.updatedAt,
        ],
      );

      return account;
    }

    const existing = this.memory.get(
      account.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        account.id,
        account,
      );
    }

    return account;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM hosting_accounts WHERE id = $1 AND organization_id = $2",
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
): HostingRow | undefined {
  return row as HostingRow | undefined;
}

function mapRow(
  row: HostingRow,
): PlatformHostingAccountRecord {
  const record: PlatformHostingAccountRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      domain: row.domain,
      status:
        row.status as PlatformHostingStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id) {
    record.clientId = row.client_id;
  }

  if (row.plan) {
    record.plan = row.plan;
  }

  if (row.notes) {
    record.notes = row.notes;
  }

  return record;
}
