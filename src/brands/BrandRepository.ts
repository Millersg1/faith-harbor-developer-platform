import type {
  DatabaseSync,
} from "node:sqlite";

import type { BrandRecord } from "./BrandTypes";

interface BrandRow {
  id: string;
  name: string;
  domain: string | null;
  from_email: string | null;
  email_signature: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores brands. In memory without a database; persistent with SQLite.
 */
export class BrandRepository {
  private readonly brands =
    new Map<string, BrandRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    brand: BrandRecord,
  ): BrandRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO brands (
            id, name, domain, from_email, email_signature, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          brand.id,
          brand.name,
          brand.domain ?? null,
          brand.fromEmail ?? null,
          brand.emailSignature ??
            null,
          brand.createdAt,
          brand.updatedAt,
        );

      return brand;
    }

    this.brands.set(
      brand.id,
      brand,
    );

    return brand;
  }

  update(
    brand: BrandRecord,
  ): BrandRecord {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE brands
          SET name = ?, domain = ?, from_email = ?, email_signature = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          brand.name,
          brand.domain ?? null,
          brand.fromEmail ?? null,
          brand.emailSignature ??
            null,
          brand.updatedAt,
          brand.id,
        );

      return brand;
    }

    this.brands.set(
      brand.id,
      brand,
    );

    return brand;
  }

  get(
    id: string,
  ): BrandRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT id, name, domain, from_email, email_signature, created_at, updated_at
            FROM brands
            WHERE id = ?
          `)
          .get(id) as unknown as
          BrandRow | undefined;

      return row
        ? this.mapRow(row)
        : undefined;
    }

    return this.brands.get(id);
  }

  list(): BrandRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT id, name, domain, from_email, email_signature, created_at, updated_at
            FROM brands
            ORDER BY name ASC
          `)
          .all() as unknown as
          BrandRow[];

      return rows.map((row) =>
        this.mapRow(row),
      );
    }

    return Array.from(
      this.brands.values(),
    );
  }

  delete(id: string): void {
    if (this.database) {
      this.database
        .prepare(
          "DELETE FROM brands WHERE id = ?",
        )
        .run(id);

      return;
    }

    this.brands.delete(id);
  }

  private mapRow(
    row: BrandRow,
  ): BrandRecord {
    return {
      id: row.id,
      name: row.name,
      domain: row.domain ?? undefined,
      fromEmail:
        row.from_email ?? undefined,
      emailSignature:
        row.email_signature ??
        undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
