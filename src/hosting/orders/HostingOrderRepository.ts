import type { DatabaseSync } from "node:sqlite";

import type {
  HostingBillingCycle,
  HostingOrderRecord,
  HostingOrderStatus,
} from "./HostingOrderTypes";

interface HostingOrderRow {
  id: string;
  client_id: string;
  plan_id: string;
  domain: string;
  contact_email: string;
  brand_id: string | null;
  billing_cycle: string;
  invoice_id: string;
  status: string;
  username: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores hosting orders. In memory without a database; persistent with
 * SQLite.
 */
export class HostingOrderRepository {
  private readonly orders =
    new Map<string, HostingOrderRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    order: HostingOrderRecord,
  ): HostingOrderRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO hosting_orders (
            id, client_id, plan_id, domain, contact_email, brand_id,
            billing_cycle, invoice_id, status, username, error,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          order.id,
          order.clientId,
          order.planId,
          order.domain,
          order.contactEmail,
          order.brandId ?? null,
          order.billingCycle,
          order.invoiceId,
          order.status,
          order.username ?? null,
          order.error ?? null,
          order.createdAt,
          order.updatedAt,
        );

      return order;
    }

    this.orders.set(order.id, order);

    return order;
  }

  update(
    order: HostingOrderRecord,
  ): HostingOrderRecord {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE hosting_orders
          SET status = ?, username = ?, error = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          order.status,
          order.username ?? null,
          order.error ?? null,
          order.updatedAt,
          order.id,
        );

      return order;
    }

    this.orders.set(order.id, order);

    return order;
  }

  findByInvoiceId(
    invoiceId: string,
  ): HostingOrderRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(
            "SELECT * FROM hosting_orders WHERE invoice_id = ?",
          )
          .get(invoiceId) as unknown as
          HostingOrderRow | undefined;

      return row
        ? this.mapRow(row)
        : undefined;
    }

    for (const order of this.orders.values()) {
      if (
        order.invoiceId === invoiceId
      ) {
        return order;
      }
    }

    return undefined;
  }

  list(): HostingOrderRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(
            "SELECT * FROM hosting_orders ORDER BY created_at DESC",
          )
          .all() as unknown as
          HostingOrderRow[];

      return rows.map((row) =>
        this.mapRow(row),
      );
    }

    return Array.from(
      this.orders.values(),
    );
  }

  private mapRow(
    row: HostingOrderRow,
  ): HostingOrderRecord {
    const order: HostingOrderRecord = {
      id: row.id,
      clientId: row.client_id,
      planId: row.plan_id,
      domain: row.domain,
      contactEmail: row.contact_email,
      billingCycle:
        row.billing_cycle === "yearly"
          ? "yearly"
          : ("monthly" as HostingBillingCycle),
      invoiceId: row.invoice_id,
      status:
        row.status as HostingOrderStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (row.brand_id) {
      order.brandId = row.brand_id;
    }

    if (row.username) {
      order.username = row.username;
    }

    if (row.error) {
      order.error = row.error;
    }

    return order;
  }
}
