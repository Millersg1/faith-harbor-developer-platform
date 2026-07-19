import type {
  DatabaseSync,
} from "node:sqlite";

import type { ProductRecord } from "./ProductRecord";
import type { ProductStatus } from "./ProductStatus";

interface ProductRow {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: string;
  repo_url: string | null;
  language: string | null;
  version: string | null;
  last_release_date: string | null;
  owner: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves software product records.
 *
 * Without a database connection, products are kept in memory.
 * When SQLite is supplied, products persist across restarts.
 */
export class ProductRepository {
  private readonly products =
    new Map<string, ProductRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    product: ProductRecord,
  ): ProductRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO products (
            id,
            client_id,
            name,
            description,
            status,
            repo_url,
            language,
            version,
            last_release_date,
            owner,
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
            ?
          )
        `)
        .run(
          product.id,
          product.clientId ?? null,
          product.name,
          product.description ?? null,
          product.status,
          product.repoUrl ?? null,
          product.language ?? null,
          product.version ?? null,
          product.lastReleaseDate ?? null,
          product.owner ?? null,
          product.notes ?? null,
          JSON.stringify(
            product.metadata ?? {},
          ),
          product.createdAt,
          product.updatedAt,
        );

      return product;
    }

    this.products.set(
      product.id,
      product,
    );

    return product;
  }

  get(
    id: string,
  ): ProductRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              description,
              status,
              repo_url,
              language,
              version,
              last_release_date,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM products
            WHERE id = ?
          `)
          .get(id) as
          | ProductRow
          | undefined;

      if (!row) {
        throw new Error(
          `Product "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const product =
      this.products.get(id);

    if (!product) {
      throw new Error(
        `Product "${id}" was not found.`,
      );
    }

    return product;
  }

  list(): ProductRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              description,
              status,
              repo_url,
              language,
              version,
              last_release_date,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM products
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          ProductRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.products.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): ProductRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              description,
              status,
              repo_url,
              language,
              version,
              last_release_date,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM products
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          ProductRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.products.values(),
    ).filter(
      (product) =>
        product.clientId === clientId,
    );
  }

  update(
    product: ProductRecord,
  ): ProductRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE products
            SET
              client_id = ?,
              name = ?,
              description = ?,
              status = ?,
              repo_url = ?,
              language = ?,
              version = ?,
              last_release_date = ?,
              owner = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            product.clientId ?? null,
            product.name,
            product.description ?? null,
            product.status,
            product.repoUrl ?? null,
            product.language ?? null,
            product.version ?? null,
            product.lastReleaseDate ?? null,
            product.owner ?? null,
            product.notes ?? null,
            JSON.stringify(
              product.metadata ?? {},
            ),
            product.updatedAt,
            product.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Product "${product.id}" was not found.`,
        );
      }

      return product;
    }

    if (
      !this.products.has(
        product.id,
      )
    ) {
      throw new Error(
        `Product "${product.id}" was not found.`,
      );
    }

    this.products.set(
      product.id,
      product,
    );

    return product;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM products
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Product "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.products.delete(id);

    if (!deleted) {
      throw new Error(
        `Product "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a product record.
   */
  private mapRow(
    row: ProductRow,
  ): ProductRecord {
    return {
      id: row.id,
      clientId:
        row.client_id ?? undefined,
      name: row.name,
      description:
        row.description ?? undefined,
      status:
        row.status as ProductStatus,
      repoUrl:
        row.repo_url ?? undefined,
      language:
        row.language ?? undefined,
      version:
        row.version ?? undefined,
      lastReleaseDate:
        row.last_release_date ??
        undefined,
      owner:
        row.owner ?? undefined,
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
   * Safely parses product metadata stored as JSON.
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
