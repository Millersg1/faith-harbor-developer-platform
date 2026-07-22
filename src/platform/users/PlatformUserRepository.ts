import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformUserRecord,
  PlatformUserRole,
  PlatformUserStatus,
} from "./PlatformUser";

interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores users, always scoped to the current tenant. Email lookups are
 * confined to the acting organization, so a login can only ever match a
 * user inside the tenant the request is for.
 */
export class PlatformUserRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<string, PlatformUserRecord>();

  async create(
    user: Omit<
      PlatformUserRecord,
      "organizationId"
    >,
  ): Promise<PlatformUserRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformUserRecord =
      { ...user, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO users
           (id, organization_id, email, password_hash, name,
            role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id,
          record.organizationId,
          record.email,
          record.passwordHash,
          record.name ?? null,
          record.role,
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

  async findByEmail(
    email: string,
  ): Promise<
    PlatformUserRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    const normalized = email
      .trim()
      .toLowerCase();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM users WHERE organization_id = $1 AND email = $2",
          [organizationId, normalized],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    for (const record of this.memory.values()) {
      if (
        record.organizationId ===
          organizationId &&
        record.email === normalized
      ) {
        return record;
      }
    }

    return undefined;
  }

  async get(
    id: string,
  ): Promise<
    PlatformUserRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM users WHERE id = $1 AND organization_id = $2",
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
    PlatformUserRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM users
            WHERE organization_id = $1
            ORDER BY created_at ASC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (row): row is UserRow =>
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
    user: PlatformUserRecord,
  ): Promise<PlatformUserRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE users
            SET email = $3, password_hash = $4, name = $5,
                role = $6, status = $7, updated_at = $8
          WHERE id = $1 AND organization_id = $2`,
        [
          user.id,
          organizationId,
          user.email,
          user.passwordHash,
          user.name ?? null,
          user.role,
          user.status,
          user.updatedAt,
        ],
      );

      return user;
    }

    const existing = this.memory.get(
      user.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(user.id, user);
    }

    return user;
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): UserRow | undefined {
  return row as UserRow | undefined;
}

function mapRow(
  row: UserRow,
): PlatformUserRecord {
  const record: PlatformUserRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role as PlatformUserRole,
    status:
      row.status as PlatformUserStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.name) {
    record.name = row.name;
  }

  return record;
}
