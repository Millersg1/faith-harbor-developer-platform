import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformBookRecord,
  PlatformBookStatus,
} from "./PlatformBook";

interface BookRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  subtitle: string | null;
  author: string | null;
  status: string;
  format: string | null;
  isbn: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores books, always scoped to the current tenant.
 */
export class PlatformBookRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformBookRecord
    >();

  async create(
    book: Omit<
      PlatformBookRecord,
      "organizationId"
    >,
  ): Promise<PlatformBookRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformBookRecord =
      { ...book, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO books
           (id, organization_id, client_id, title, subtitle, author,
            status, format, isbn, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.title,
          record.subtitle ?? null,
          record.author ?? null,
          record.status,
          record.format ?? null,
          record.isbn ?? null,
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
    PlatformBookRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM books WHERE id = $1 AND organization_id = $2",
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
    PlatformBookRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM books
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (row): row is BookRow =>
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
    book: PlatformBookRecord,
  ): Promise<PlatformBookRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE books
            SET client_id = $3, title = $4, subtitle = $5, author = $6,
                status = $7, format = $8, isbn = $9, notes = $10,
                updated_at = $11
          WHERE id = $1 AND organization_id = $2`,
        [
          book.id,
          organizationId,
          book.clientId ?? null,
          book.title,
          book.subtitle ?? null,
          book.author ?? null,
          book.status,
          book.format ?? null,
          book.isbn ?? null,
          book.notes ?? null,
          book.updatedAt,
        ],
      );

      return book;
    }

    const existing = this.memory.get(
      book.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(book.id, book);
    }

    return book;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM books WHERE id = $1 AND organization_id = $2",
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
): BookRow | undefined {
  return row as BookRow | undefined;
}

function mapRow(
  row: BookRow,
): PlatformBookRecord {
  const record: PlatformBookRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    title: row.title,
    status:
      row.status as PlatformBookStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.subtitle)
    record.subtitle = row.subtitle;
  if (row.author)
    record.author = row.author;
  if (row.format)
    record.format = row.format;
  if (row.isbn)
    record.isbn = row.isbn;
  if (row.notes)
    record.notes = row.notes;

  return record;
}
