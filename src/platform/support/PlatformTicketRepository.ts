import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformTicketPriority,
  PlatformTicketRecord,
  PlatformTicketStatus,
} from "./PlatformTicket";

interface TicketRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores support tickets, always scoped to the current tenant. Same
 * isolation contract as every tenant-scoped repository: resolve the
 * organization from context (fail closed) and constrain every query to it.
 */
export class PlatformTicketRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformTicketRecord
    >();

  async create(
    ticket: Omit<
      PlatformTicketRecord,
      "organizationId"
    >,
  ): Promise<PlatformTicketRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformTicketRecord =
      { ...ticket, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO support_tickets
           (id, organization_id, client_id, subject, description,
            status, priority, assignee, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.subject,
          record.description ?? null,
          record.status,
          record.priority,
          record.assignee ?? null,
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
    PlatformTicketRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM support_tickets WHERE id = $1 AND organization_id = $2",
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
    PlatformTicketRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM support_tickets
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is TicketRow =>
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
    ticket: PlatformTicketRecord,
  ): Promise<PlatformTicketRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE support_tickets
            SET client_id = $3, subject = $4, description = $5,
                status = $6, priority = $7, assignee = $8, updated_at = $9
          WHERE id = $1 AND organization_id = $2`,
        [
          ticket.id,
          organizationId,
          ticket.clientId ?? null,
          ticket.subject,
          ticket.description ?? null,
          ticket.status,
          ticket.priority,
          ticket.assignee ?? null,
          ticket.updatedAt,
        ],
      );

      return ticket;
    }

    const existing = this.memory.get(
      ticket.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        ticket.id,
        ticket,
      );
    }

    return ticket;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM support_tickets WHERE id = $1 AND organization_id = $2",
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
): TicketRow | undefined {
  return row as TicketRow | undefined;
}

function mapRow(
  row: TicketRow,
): PlatformTicketRecord {
  const record: PlatformTicketRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      subject: row.subject,
      status:
        row.status as PlatformTicketStatus,
      priority:
        row.priority as PlatformTicketPriority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id) {
    record.clientId = row.client_id;
  }

  if (row.description) {
    record.description =
      row.description;
  }

  if (row.assignee) {
    record.assignee = row.assignee;
  }

  return record;
}
