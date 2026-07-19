import type {
  DatabaseSync,
} from "node:sqlite";

import type { InvoiceLineItem } from "./InvoiceLineItem";
import type { InvoiceRecord } from "./InvoiceRecord";
import type { InvoiceStatus } from "./InvoiceStatus";

interface InvoiceRow {
  id: string;
  number: string;
  client_id: string;
  project_id: string | null;
  status: string;
  currency: string;
  line_items_json: string;
  amount: number;
  issue_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves invoice records.
 *
 * Without a database connection, invoices are kept in memory.
 * When SQLite is supplied, invoices persist across restarts.
 */
export class InvoiceRepository {
  private readonly invoices =
    new Map<string, InvoiceRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    invoice: InvoiceRecord,
  ): InvoiceRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO invoices (
            id,
            number,
            client_id,
            project_id,
            status,
            currency,
            line_items_json,
            amount,
            issue_date,
            due_date,
            paid_date,
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
            ?
          )
        `)
        .run(
          invoice.id,
          invoice.number,
          invoice.clientId,
          invoice.projectId ?? null,
          invoice.status,
          invoice.currency,
          JSON.stringify(
            invoice.lineItems,
          ),
          invoice.amount,
          invoice.issueDate ?? null,
          invoice.dueDate ?? null,
          invoice.paidDate ?? null,
          invoice.notes ?? null,
          JSON.stringify(
            invoice.metadata ?? {},
          ),
          invoice.createdAt,
          invoice.updatedAt,
        );

      return invoice;
    }

    this.invoices.set(
      invoice.id,
      invoice,
    );

    return invoice;
  }

  get(
    id: string,
  ): InvoiceRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              number,
              client_id,
              project_id,
              status,
              currency,
              line_items_json,
              amount,
              issue_date,
              due_date,
              paid_date,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM invoices
            WHERE id = ?
          `)
          .get(id) as
          | InvoiceRow
          | undefined;

      if (!row) {
        throw new Error(
          `Invoice "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const invoice =
      this.invoices.get(id);

    if (!invoice) {
      throw new Error(
        `Invoice "${id}" was not found.`,
      );
    }

    return invoice;
  }

  list(): InvoiceRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              number,
              client_id,
              project_id,
              status,
              currency,
              line_items_json,
              amount,
              issue_date,
              due_date,
              paid_date,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM invoices
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          InvoiceRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.invoices.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): InvoiceRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              number,
              client_id,
              project_id,
              status,
              currency,
              line_items_json,
              amount,
              issue_date,
              due_date,
              paid_date,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM invoices
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          InvoiceRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.invoices.values(),
    ).filter(
      (invoice) =>
        invoice.clientId === clientId,
    );
  }

  count(): number {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT COUNT(*) AS total
            FROM invoices
          `)
          .get() as
          | { total: number }
          | undefined;

      return row?.total ?? 0;
    }

    return this.invoices.size;
  }

  update(
    invoice: InvoiceRecord,
  ): InvoiceRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE invoices
            SET
              number = ?,
              client_id = ?,
              project_id = ?,
              status = ?,
              currency = ?,
              line_items_json = ?,
              amount = ?,
              issue_date = ?,
              due_date = ?,
              paid_date = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            invoice.number,
            invoice.clientId,
            invoice.projectId ?? null,
            invoice.status,
            invoice.currency,
            JSON.stringify(
              invoice.lineItems,
            ),
            invoice.amount,
            invoice.issueDate ?? null,
            invoice.dueDate ?? null,
            invoice.paidDate ?? null,
            invoice.notes ?? null,
            JSON.stringify(
              invoice.metadata ?? {},
            ),
            invoice.updatedAt,
            invoice.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Invoice "${invoice.id}" was not found.`,
        );
      }

      return invoice;
    }

    if (
      !this.invoices.has(
        invoice.id,
      )
    ) {
      throw new Error(
        `Invoice "${invoice.id}" was not found.`,
      );
    }

    this.invoices.set(
      invoice.id,
      invoice,
    );

    return invoice;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM invoices
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Invoice "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.invoices.delete(id);

    if (!deleted) {
      throw new Error(
        `Invoice "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into an invoice record.
   */
  private mapRow(
    row: InvoiceRow,
  ): InvoiceRecord {
    return {
      id: row.id,
      number: row.number,
      clientId: row.client_id,
      projectId:
        row.project_id ?? undefined,
      status:
        row.status as InvoiceStatus,
      currency: row.currency,
      lineItems:
        this.parseLineItems(
          row.line_items_json,
        ),
      amount: row.amount,
      issueDate:
        row.issue_date ?? undefined,
      dueDate:
        row.due_date ?? undefined,
      paidDate:
        row.paid_date ?? undefined,
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
   * Safely parses invoice line items stored as JSON.
   */
  private parseLineItems(
    value: string,
  ): InvoiceLineItem[] {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed as
          InvoiceLineItem[];
      }
    } catch {
      // Invalid historical data is treated as empty.
    }

    return [];
  }

  /**
   * Safely parses invoice metadata stored as JSON.
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
