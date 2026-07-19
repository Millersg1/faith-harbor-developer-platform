import type {
  DatabaseSync,
} from "node:sqlite";

import type {
  PaymentRecord,
  PaymentStatus,
} from "./PaymentTypes";

interface PaymentRow {
  id: string;
  invoice_id: string;
  client_id: string;
  amount: number;
  currency: string;
  status: string;
  session_id: string | null;
  checkout_url: string | null;
  created_at: string;
  paid_at: string | null;
}

/**
 * Stores payment records. In memory without a database; persistent
 * with SQLite.
 */
export class PaymentRepository {
  private readonly payments =
    new Map<string, PaymentRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    payment: PaymentRecord,
  ): PaymentRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO payments (
            id, invoice_id, client_id, amount,
            currency, status, session_id, checkout_url,
            created_at, paid_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          payment.id,
          payment.invoiceId,
          payment.clientId,
          payment.amount,
          payment.currency,
          payment.status,
          payment.sessionId ?? null,
          payment.checkoutUrl ??
            null,
          payment.createdAt,
          payment.paidAt ?? null,
        );

      return payment;
    }

    this.payments.set(
      payment.id,
      payment,
    );

    return payment;
  }

  update(
    payment: PaymentRecord,
  ): PaymentRecord {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE payments
          SET status = ?, paid_at = ?
          WHERE id = ?
        `)
        .run(
          payment.status,
          payment.paidAt ?? null,
          payment.id,
        );

      return payment;
    }

    this.payments.set(
      payment.id,
      payment,
    );

    return payment;
  }

  list(): PaymentRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id, invoice_id, client_id, amount,
              currency, status, session_id, checkout_url,
              created_at, paid_at
            FROM payments
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          PaymentRow[];

      return rows.map((row) =>
        this.mapRow(row),
      );
    }

    return Array.from(
      this.payments.values(),
    );
  }

  findBySession(
    sessionId: string,
  ): PaymentRecord | undefined {
    return this.list().find(
      (payment) =>
        payment.sessionId ===
        sessionId,
    );
  }

  findByInvoice(
    invoiceId: string,
  ): PaymentRecord[] {
    return this.list().filter(
      (payment) =>
        payment.invoiceId ===
        invoiceId,
    );
  }

  private mapRow(
    row: PaymentRow,
  ): PaymentRecord {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      clientId: row.client_id,
      amount: row.amount,
      currency: row.currency,
      status:
        row.status as PaymentStatus,
      sessionId:
        row.session_id ?? undefined,
      checkoutUrl:
        row.checkout_url ?? undefined,
      createdAt: row.created_at,
      paidAt:
        row.paid_at ?? undefined,
    };
  }
}
