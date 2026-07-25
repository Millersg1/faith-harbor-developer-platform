import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformProductRecord,
  PlatformProductStatus,
} from "./PlatformProduct";

interface ProductRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: string;
  repo_url: string | null;
  language: string | null;
  version: string | null;
  owner: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores products, always scoped to the current tenant.
 */
export class PlatformProductRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformProductRecord
    >();

  async create(
    product: Omit<
      PlatformProductRecord,
      "organizationId"
    >,
  ): Promise<PlatformProductRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformProductRecord =
      { ...product, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO products
           (id, organization_id, client_id, name, description, status,
            repo_url, language, version, owner, notes,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.name,
          record.description ?? null,
          record.status,
          record.repoUrl ?? null,
          record.language ?? null,
          record.version ?? null,
          record.owner ?? null,
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
    PlatformProductRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM products WHERE id = $1 AND organization_id = $2",
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
    PlatformProductRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM products
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is ProductRow =>
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
    product: PlatformProductRecord,
  ): Promise<PlatformProductRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE products
            SET client_id = $3, name = $4, description = $5, status = $6,
                repo_url = $7, language = $8, version = $9, owner = $10,
                notes = $11, updated_at = $12
          WHERE id = $1 AND organization_id = $2`,
        [
          product.id,
          organizationId,
          product.clientId ?? null,
          product.name,
          product.description ?? null,
          product.status,
          product.repoUrl ?? null,
          product.language ?? null,
          product.version ?? null,
          product.owner ?? null,
          product.notes ?? null,
          product.updatedAt,
        ],
      );

      return product;
    }

    const existing = this.memory.get(
      product.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        product.id,
        product,
      );
    }

    return product;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM products WHERE id = $1 AND organization_id = $2",
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
): ProductRow | undefined {
  return row as ProductRow | undefined;
}

function mapRow(
  row: ProductRow,
): PlatformProductRecord {
  const record: PlatformProductRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      status:
        row.status as PlatformProductStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.description)
    record.description =
      row.description;
  if (row.repo_url)
    record.repoUrl = row.repo_url;
  if (row.language)
    record.language = row.language;
  if (row.version)
    record.version = row.version;
  if (row.owner)
    record.owner = row.owner;
  if (row.notes)
    record.notes = row.notes;

  return record;
}
