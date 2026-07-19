import type {
  DatabaseSync,
} from "node:sqlite";

import type { BookRecord } from "./BookRecord";
import type { BookStatus } from "./BookStatus";

interface BookRow {
  id: string;
  client_id: string | null;
  title: string;
  subtitle: string | null;
  author: string;
  status: string;
  format: string | null;
  isbn: string | null;
  word_count: number | null;
  target_date: string | null;
  published_date: string | null;
  royalties: number | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves book records.
 *
 * Without a database connection, books are kept in memory.
 * When SQLite is supplied, books persist across restarts.
 */
export class BookRepository {
  private readonly books =
    new Map<string, BookRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    book: BookRecord,
  ): BookRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO books (
            id,
            client_id,
            title,
            subtitle,
            author,
            status,
            format,
            isbn,
            word_count,
            target_date,
            published_date,
            royalties,
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
            ?,
            ?
          )
        `)
        .run(
          book.id,
          book.clientId ?? null,
          book.title,
          book.subtitle ?? null,
          book.author,
          book.status,
          book.format ?? null,
          book.isbn ?? null,
          book.wordCount ?? null,
          book.targetDate ?? null,
          book.publishedDate ?? null,
          book.royalties ?? null,
          book.notes ?? null,
          JSON.stringify(
            book.metadata ?? {},
          ),
          book.createdAt,
          book.updatedAt,
        );

      return book;
    }

    this.books.set(
      book.id,
      book,
    );

    return book;
  }

  get(
    id: string,
  ): BookRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              title,
              subtitle,
              author,
              status,
              format,
              isbn,
              word_count,
              target_date,
              published_date,
              royalties,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM books
            WHERE id = ?
          `)
          .get(id) as
          | BookRow
          | undefined;

      if (!row) {
        throw new Error(
          `Book "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const book =
      this.books.get(id);

    if (!book) {
      throw new Error(
        `Book "${id}" was not found.`,
      );
    }

    return book;
  }

  list(): BookRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              title,
              subtitle,
              author,
              status,
              format,
              isbn,
              word_count,
              target_date,
              published_date,
              royalties,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM books
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          BookRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.books.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): BookRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              title,
              subtitle,
              author,
              status,
              format,
              isbn,
              word_count,
              target_date,
              published_date,
              royalties,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM books
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          BookRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.books.values(),
    ).filter(
      (book) =>
        book.clientId === clientId,
    );
  }

  update(
    book: BookRecord,
  ): BookRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE books
            SET
              client_id = ?,
              title = ?,
              subtitle = ?,
              author = ?,
              status = ?,
              format = ?,
              isbn = ?,
              word_count = ?,
              target_date = ?,
              published_date = ?,
              royalties = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            book.clientId ?? null,
            book.title,
            book.subtitle ?? null,
            book.author,
            book.status,
            book.format ?? null,
            book.isbn ?? null,
            book.wordCount ?? null,
            book.targetDate ?? null,
            book.publishedDate ?? null,
            book.royalties ?? null,
            book.notes ?? null,
            JSON.stringify(
              book.metadata ?? {},
            ),
            book.updatedAt,
            book.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Book "${book.id}" was not found.`,
        );
      }

      return book;
    }

    if (
      !this.books.has(book.id)
    ) {
      throw new Error(
        `Book "${book.id}" was not found.`,
      );
    }

    this.books.set(
      book.id,
      book,
    );

    return book;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM books
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Book "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.books.delete(id);

    if (!deleted) {
      throw new Error(
        `Book "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a book record.
   */
  private mapRow(
    row: BookRow,
  ): BookRecord {
    return {
      id: row.id,
      clientId:
        row.client_id ?? undefined,
      title: row.title,
      subtitle:
        row.subtitle ?? undefined,
      author: row.author,
      status:
        row.status as BookStatus,
      format:
        row.format ?? undefined,
      isbn:
        row.isbn ?? undefined,
      wordCount:
        row.word_count ?? undefined,
      targetDate:
        row.target_date ?? undefined,
      publishedDate:
        row.published_date ?? undefined,
      royalties:
        row.royalties ?? undefined,
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
   * Safely parses book metadata stored as JSON.
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
