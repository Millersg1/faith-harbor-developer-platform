import type {
  DatabaseSync,
} from "node:sqlite";

import type { HostingAccountRecord } from "./HostingAccountRecord";
import type { HostingAccountStatus } from "./HostingAccountStatus";

interface HostingAccountRow {
  id: string;
  client_id: string | null;
  brand: string | null;
  domain: string;
  username: string;
  plan: string | null;
  status: string;
  server: string | null;
  ip_address: string | null;
  disk_used_mb: number | null;
  disk_limit_mb: number | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves hosting account records.
 *
 * Without a database connection, accounts are kept in memory.
 * When SQLite is supplied, accounts persist across restarts.
 */
export class HostingAccountRepository {
  private readonly accounts =
    new Map<string, HostingAccountRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    account: HostingAccountRecord,
  ): HostingAccountRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO hosting_accounts (
            id,
            client_id,
            brand,
            domain,
            username,
            plan,
            status,
            server,
            ip_address,
            disk_used_mb,
            disk_limit_mb,
            notes,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `)
        .run(
          account.id,
          account.clientId ?? null,
          account.brand ?? null,
          account.domain,
          account.username,
          account.plan ?? null,
          account.status,
          account.server ?? null,
          account.ipAddress ?? null,
          account.diskUsedMb ?? null,
          account.diskLimitMb ?? null,
          account.notes ?? null,
          JSON.stringify(
            account.metadata ?? {},
          ),
          account.createdAt,
          account.updatedAt,
        );

      return account;
    }

    this.accounts.set(
      account.id,
      account,
    );

    return account;
  }

  get(
    id: string,
  ): HostingAccountRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              brand,
              domain,
              username,
              plan,
              status,
              server,
              ip_address,
              disk_used_mb,
              disk_limit_mb,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM hosting_accounts
            WHERE id = ?
          `)
          .get(id) as
          | HostingAccountRow
          | undefined;

      if (!row) {
        throw new Error(
          `Hosting account "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const account =
      this.accounts.get(id);

    if (!account) {
      throw new Error(
        `Hosting account "${id}" was not found.`,
      );
    }

    return account;
  }

  list(): HostingAccountRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              brand,
              domain,
              username,
              plan,
              status,
              server,
              ip_address,
              disk_used_mb,
              disk_limit_mb,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM hosting_accounts
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          HostingAccountRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.accounts.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): HostingAccountRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              brand,
              domain,
              username,
              plan,
              status,
              server,
              ip_address,
              disk_used_mb,
              disk_limit_mb,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM hosting_accounts
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          HostingAccountRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.accounts.values(),
    ).filter(
      (account) =>
        account.clientId === clientId,
    );
  }

  update(
    account: HostingAccountRecord,
  ): HostingAccountRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE hosting_accounts
            SET
              client_id = ?,
              brand = ?,
              domain = ?,
              username = ?,
              plan = ?,
              status = ?,
              server = ?,
              ip_address = ?,
              disk_used_mb = ?,
              disk_limit_mb = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            account.clientId ?? null,
            account.brand ?? null,
            account.domain,
            account.username,
            account.plan ?? null,
            account.status,
            account.server ?? null,
            account.ipAddress ?? null,
            account.diskUsedMb ?? null,
            account.diskLimitMb ?? null,
            account.notes ?? null,
            JSON.stringify(
              account.metadata ?? {},
            ),
            account.updatedAt,
            account.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Hosting account "${account.id}" was not found.`,
        );
      }

      return account;
    }

    if (
      !this.accounts.has(
        account.id,
      )
    ) {
      throw new Error(
        `Hosting account "${account.id}" was not found.`,
      );
    }

    this.accounts.set(
      account.id,
      account,
    );

    return account;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM hosting_accounts
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Hosting account "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.accounts.delete(id);

    if (!deleted) {
      throw new Error(
        `Hosting account "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a hosting account record.
   */
  private mapRow(
    row: HostingAccountRow,
  ): HostingAccountRecord {
    return {
      id: row.id,
      clientId:
        row.client_id ?? undefined,
      brand:
        row.brand ?? undefined,
      domain: row.domain,
      username: row.username,
      plan:
        row.plan ?? undefined,
      status:
        row.status as HostingAccountStatus,
      server:
        row.server ?? undefined,
      ipAddress:
        row.ip_address ?? undefined,
      diskUsedMb:
        row.disk_used_mb ?? undefined,
      diskLimitMb:
        row.disk_limit_mb ?? undefined,
      notes:
        row.notes ?? undefined,
      metadata:
        this.parseMetadata(
          row.metadata_json,
        ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Safely parses hosting account metadata stored as JSON.
   */
  private parseMetadata(
    value: string,
  ): Record<string, unknown> {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as
          Record<string, unknown>;
      }
    } catch {
      // Invalid historical metadata is treated as empty.
    }

    return {};
  }
}
