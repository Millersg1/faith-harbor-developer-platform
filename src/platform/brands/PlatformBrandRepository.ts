import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { PlatformBrandRecord } from "./PlatformBrand";

interface BrandRow {
  id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  from_email: string | null;
  email_signature: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores brands, always scoped to the current tenant. Same isolation
 * contract as every tenant-scoped repository.
 */
export class PlatformBrandRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformBrandRecord
    >();

  async create(
    brand: Omit<
      PlatformBrandRecord,
      "organizationId"
    >,
  ): Promise<PlatformBrandRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformBrandRecord =
      { ...brand, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO brands
           (id, organization_id, name, domain, from_email, email_signature,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          record.id,
          record.organizationId,
          record.name,
          record.domain ?? null,
          record.fromEmail ?? null,
          record.emailSignature ??
            null,
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
    PlatformBrandRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM brands WHERE id = $1 AND organization_id = $2",
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
    PlatformBrandRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM brands
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (row): row is BrandRow =>
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
    brand: PlatformBrandRecord,
  ): Promise<PlatformBrandRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE brands
            SET name = $3, domain = $4, from_email = $5,
                email_signature = $6, updated_at = $7
          WHERE id = $1 AND organization_id = $2`,
        [
          brand.id,
          organizationId,
          brand.name,
          brand.domain ?? null,
          brand.fromEmail ?? null,
          brand.emailSignature ??
            null,
          brand.updatedAt,
        ],
      );

      return brand;
    }

    const existing = this.memory.get(
      brand.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        brand.id,
        brand,
      );
    }

    return brand;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM brands WHERE id = $1 AND organization_id = $2",
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
): BrandRow | undefined {
  return row as BrandRow | undefined;
}

function mapRow(
  row: BrandRow,
): PlatformBrandRecord {
  const record: PlatformBrandRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.domain)
    record.domain = row.domain;
  if (row.from_email)
    record.fromEmail = row.from_email;
  if (row.email_signature)
    record.emailSignature =
      row.email_signature;

  return record;
}
