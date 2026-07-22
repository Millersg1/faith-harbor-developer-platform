import type { PgQueryable } from "../persistence/PgQueryable";
import type {
  OrganizationRecord,
  OrganizationStatus,
} from "./Organization";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores organizations (tenants). In memory without a database (so the
 * test suite never opens a connection); persistent against Postgres when
 * a query surface is supplied. Every method is async because Postgres is
 * a network database — this sets the async pattern the rest of the
 * tenant-scoped data layer follows.
 */
export class OrganizationRepository {
  private readonly memory =
    new Map<string, OrganizationRecord>();

  constructor(
    private readonly db?: PgQueryable,
  ) {}

  async create(
    organization: OrganizationRecord,
  ): Promise<OrganizationRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO organizations
           (id, name, slug, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          organization.id,
          organization.name,
          organization.slug,
          organization.status,
          organization.createdAt,
          organization.updatedAt,
        ],
      );

      return organization;
    }

    this.memory.set(
      organization.id,
      organization,
    );

    return organization;
  }

  async get(
    id: string,
  ): Promise<
    OrganizationRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organizations WHERE id = $1",
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

  async findBySlug(
    slug: string,
  ): Promise<
    OrganizationRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organizations WHERE slug = $1",
          [slug],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    for (const organization of this.memory.values()) {
      if (
        organization.slug === slug
      ) {
        return organization;
      }
    }

    return undefined;
  }

  async list(): Promise<
    OrganizationRecord[]
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organizations ORDER BY created_at ASC",
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is OrganizationRow =>
            row !== undefined,
        )
        .map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    );
  }

  async update(
    organization: OrganizationRecord,
  ): Promise<OrganizationRecord> {
    if (this.db) {
      await this.db.query(
        `UPDATE organizations
            SET name = $2, slug = $3, status = $4, updated_at = $5
          WHERE id = $1`,
        [
          organization.id,
          organization.name,
          organization.slug,
          organization.status,
          organization.updatedAt,
        ],
      );

      return organization;
    }

    this.memory.set(
      organization.id,
      organization,
    );

    return organization;
  }
}

/**
 * Narrows a raw Postgres row (an untyped record) to our row shape.
 */
function asRow(
  row: Record<string, unknown> | undefined,
): OrganizationRow | undefined {
  return row as
    | OrganizationRow
    | undefined;
}

function mapRow(
  row: OrganizationRow,
): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status:
      row.status as OrganizationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
