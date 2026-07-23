import type { PgQueryable } from "../../persistence/PgQueryable";
import type { PlatformAdminRecord } from "./PlatformAdmin";

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores platform administrators — a small, global (non-tenant-scoped)
 * set of accounts. Lookups are by email/id across the whole platform,
 * since admins are not confined to any organization.
 */
export class PlatformAdminRepository {
  private readonly memory =
    new Map<string, PlatformAdminRecord>();

  constructor(
    private readonly db?: PgQueryable,
  ) {}

  async create(
    admin: PlatformAdminRecord,
  ): Promise<PlatformAdminRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO platform_admins
           (id, email, password_hash, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          admin.id,
          admin.email,
          admin.passwordHash,
          admin.name ?? null,
          admin.createdAt,
          admin.updatedAt,
        ],
      );

      return admin;
    }

    this.memory.set(admin.id, admin);

    return admin;
  }

  async findByEmail(
    email: string,
  ): Promise<
    PlatformAdminRecord | undefined
  > {
    const normalized = email
      .trim()
      .toLowerCase();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM platform_admins WHERE email = $1",
          [normalized],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    for (const admin of this.memory.values()) {
      if (
        admin.email === normalized
      ) {
        return admin;
      }
    }

    return undefined;
  }

  async get(
    id: string,
  ): Promise<
    PlatformAdminRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM platform_admins WHERE id = $1",
          [id],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    return this.memory.get(id);
  }

  async count(): Promise<number> {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT COUNT(*)::int AS n FROM platform_admins",
        );

      return Number(
        (
          result.rows[0] as {
            n?: unknown;
          }
        )?.n ?? 0,
      );
    }

    return this.memory.size;
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): AdminRow | undefined {
  return row as AdminRow | undefined;
}

function mapRow(
  row: AdminRow,
): PlatformAdminRecord {
  const record: PlatformAdminRecord = {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.name) {
    record.name = row.name;
  }

  return record;
}
