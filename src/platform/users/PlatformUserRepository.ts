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
  email_verified_at: string | null;
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
      // Atomically CLEAR email verification if the email is changing (the CASE
      // sees the OLD stored email). Any path that updates a user's email thus
      // clears email_verified_at in the same write.
      await this.db.query(
        `UPDATE users
            SET email = $3, password_hash = $4, name = $5,
                role = $6, status = $7, updated_at = $8,
                email_verified_at = CASE
                  WHEN LOWER(email) <> LOWER($3) THEN NULL
                  ELSE email_verified_at END
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
      const emailChanged =
        existing.email.toLowerCase() !== user.email.toLowerCase();
      this.memory.set(user.id, {
        ...user,
        emailVerifiedAt: emailChanged
          ? undefined
          : user.emailVerifiedAt ?? existing.emailVerifiedAt,
      });
    }

    return user;
  }

  // ---- Account-email verification (INTERNAL to the verification service) ----
  // These bypass tenant scope because confirmation happens with no tenant
  // session. They are exposed ONLY to the verification adapter, never to routes
  // or unrelated services, and only ever act on a single user by id.

  /** Global-by-id lookup (no tenant filter) — verification-service internal. */
  async getByIdUnscoped(
    id: string,
  ): Promise<PlatformUserRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM users WHERE id = $1",
        [id],
      );
      const row = asRow(r.rows[0]);
      return row ? mapRow(row) : undefined;
    }
    return this.memory.get(id);
  }

  /**
   * Atomically set email_verified_at ONCE, but only if the user's CURRENT
   * (normalized) email still equals the token's bound email — so an email
   * change that raced the confirmation fails safe. Returns true on success.
   */
  async markEmailVerifiedIfEmailMatches(
    id: string,
    normalizedEmail: string,
    at: string,
  ): Promise<boolean> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE users SET email_verified_at = $3
           WHERE id = $1 AND LOWER(email) = $2 AND email_verified_at IS NULL`,
        [id, normalizedEmail, at],
      );
      return (r.rowCount ?? 0) > 0;
    }
    const u = this.memory.get(id);
    if (!u || u.email.toLowerCase() !== normalizedEmail || u.emailVerifiedAt) {
      return false;
    }
    this.memory.set(id, { ...u, emailVerifiedAt: at });
    return true;
  }

  /** Clear verification evidence (verification-service internal). */
  async clearEmailVerifiedUnscoped(id: string): Promise<void> {
    if (this.db) {
      await this.db.query(
        "UPDATE users SET email_verified_at = NULL WHERE id = $1",
        [id],
      );
      return;
    }
    const u = this.memory.get(id);
    if (u) this.memory.set(id, { ...u, emailVerifiedAt: undefined });
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM users WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing =
      this.memory.get(id);

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
  if (row.email_verified_at) {
    record.emailVerifiedAt = row.email_verified_at;
  }

  return record;
}
