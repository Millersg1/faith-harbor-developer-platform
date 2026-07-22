import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformInvoiceLineItem,
  PlatformInvoiceRecord,
  PlatformInvoiceStatus,
} from "./PlatformInvoice";

interface InvoiceRow {
  id: string;
  organization_id: string;
  number: string;
  client_id: string | null;
  status: string;
  currency: string;
  line_items: unknown;
  amount_cents: number | string;
  issue_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores invoices, always scoped to the current tenant. Line items live
 * in a JSONB column; the amount is persisted in integer cents to avoid
 * floating-point drift. Same isolation contract as every tenant-scoped
 * repository.
 */
export class PlatformInvoiceRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformInvoiceRecord
    >();

  /**
   * The number of invoices already in the current organization — used to
   * derive the next per-tenant invoice number.
   */
  async countForTenant(): Promise<number> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT COUNT(*)::int AS n FROM invoices WHERE organization_id = $1",
          [organizationId],
        );

      return Number(
        (
          result.rows[0] as {
            n?: unknown;
          }
        )?.n ?? 0,
      );
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (record) =>
        record.organizationId ===
        organizationId,
    ).length;
  }

  async create(
    invoice: Omit<
      PlatformInvoiceRecord,
      "organizationId"
    >,
  ): Promise<PlatformInvoiceRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformInvoiceRecord =
      { ...invoice, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO invoices
           (id, organization_id, number, client_id, status, currency,
            line_items, amount_cents, issue_date, due_date, paid_date,
            created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
        [
          record.id,
          record.organizationId,
          record.number,
          record.clientId ?? null,
          record.status,
          record.currency,
          JSON.stringify(
            record.lineItems,
          ),
          toCents(record.amount),
          record.issueDate ?? null,
          record.dueDate ?? null,
          record.paidDate ?? null,
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
    PlatformInvoiceRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM invoices WHERE id = $1 AND organization_id = $2",
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
    PlatformInvoiceRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM invoices
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is InvoiceRow =>
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
    invoice: PlatformInvoiceRecord,
  ): Promise<PlatformInvoiceRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE invoices
            SET client_id = $3, status = $4, currency = $5,
                line_items = $6::jsonb, amount_cents = $7,
                issue_date = $8, due_date = $9, paid_date = $10,
                updated_at = $11
          WHERE id = $1 AND organization_id = $2`,
        [
          invoice.id,
          organizationId,
          invoice.clientId ?? null,
          invoice.status,
          invoice.currency,
          JSON.stringify(
            invoice.lineItems,
          ),
          toCents(invoice.amount),
          invoice.issueDate ?? null,
          invoice.dueDate ?? null,
          invoice.paidDate ?? null,
          invoice.updatedAt,
        ],
      );

      return invoice;
    }

    const existing = this.memory.get(
      invoice.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        invoice.id,
        invoice,
      );
    }

    return invoice;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM invoices WHERE id = $1 AND organization_id = $2",
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

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function asRow(
  row: Record<string, unknown> | undefined,
): InvoiceRow | undefined {
  return row as InvoiceRow | undefined;
}

function mapRow(
  row: InvoiceRow,
): PlatformInvoiceRecord {
  const lineItems = Array.isArray(
    row.line_items,
  )
    ? (row.line_items as PlatformInvoiceLineItem[])
    : [];

  const record: PlatformInvoiceRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      number: row.number,
      status:
        row.status as PlatformInvoiceStatus,
      currency: row.currency,
      lineItems,
      amount:
        Number(row.amount_cents) / 100,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id) {
    record.clientId = row.client_id;
  }

  if (row.issue_date) {
    record.issueDate = row.issue_date;
  }

  if (row.due_date) {
    record.dueDate = row.due_date;
  }

  if (row.paid_date) {
    record.paidDate = row.paid_date;
  }

  return record;
}
