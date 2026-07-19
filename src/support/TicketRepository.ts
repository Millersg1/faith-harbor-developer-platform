import type {
  DatabaseSync,
} from "node:sqlite";

import type { TicketPriority } from "./TicketPriority";
import type { TicketRecord } from "./TicketRecord";
import type { TicketStatus } from "./TicketStatus";

interface TicketRow {
  id: string;
  number: string;
  client_id: string;
  project_id: string | null;
  hosting_account_id: string | null;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  resolution: string | null;
  resolved_date: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves support ticket records.
 *
 * Without a database connection, tickets are kept in memory.
 * When SQLite is supplied, tickets persist across restarts.
 */
export class TicketRepository {
  private readonly tickets =
    new Map<string, TicketRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    ticket: TicketRecord,
  ): TicketRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO support_tickets (
            id,
            number,
            client_id,
            project_id,
            hosting_account_id,
            subject,
            description,
            status,
            priority,
            assignee,
            resolution,
            resolved_date,
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
          ticket.id,
          ticket.number,
          ticket.clientId,
          ticket.projectId ?? null,
          ticket.hostingAccountId ??
            null,
          ticket.subject,
          ticket.description ?? null,
          ticket.status,
          ticket.priority,
          ticket.assignee ?? null,
          ticket.resolution ?? null,
          ticket.resolvedDate ?? null,
          JSON.stringify(
            ticket.metadata ?? {},
          ),
          ticket.createdAt,
          ticket.updatedAt,
        );

      return ticket;
    }

    this.tickets.set(
      ticket.id,
      ticket,
    );

    return ticket;
  }

  get(
    id: string,
  ): TicketRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              number,
              client_id,
              project_id,
              hosting_account_id,
              subject,
              description,
              status,
              priority,
              assignee,
              resolution,
              resolved_date,
              metadata_json,
              created_at,
              updated_at
            FROM support_tickets
            WHERE id = ?
          `)
          .get(id) as
          | TicketRow
          | undefined;

      if (!row) {
        throw new Error(
          `Ticket "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const ticket =
      this.tickets.get(id);

    if (!ticket) {
      throw new Error(
        `Ticket "${id}" was not found.`,
      );
    }

    return ticket;
  }

  list(): TicketRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              number,
              client_id,
              project_id,
              hosting_account_id,
              subject,
              description,
              status,
              priority,
              assignee,
              resolution,
              resolved_date,
              metadata_json,
              created_at,
              updated_at
            FROM support_tickets
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          TicketRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.tickets.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): TicketRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              number,
              client_id,
              project_id,
              hosting_account_id,
              subject,
              description,
              status,
              priority,
              assignee,
              resolution,
              resolved_date,
              metadata_json,
              created_at,
              updated_at
            FROM support_tickets
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          TicketRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.tickets.values(),
    ).filter(
      (ticket) =>
        ticket.clientId === clientId,
    );
  }

  count(): number {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT COUNT(*) AS total
            FROM support_tickets
          `)
          .get() as
          | { total: number }
          | undefined;

      return row?.total ?? 0;
    }

    return this.tickets.size;
  }

  update(
    ticket: TicketRecord,
  ): TicketRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE support_tickets
            SET
              number = ?,
              client_id = ?,
              project_id = ?,
              hosting_account_id = ?,
              subject = ?,
              description = ?,
              status = ?,
              priority = ?,
              assignee = ?,
              resolution = ?,
              resolved_date = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            ticket.number,
            ticket.clientId,
            ticket.projectId ?? null,
            ticket.hostingAccountId ??
              null,
            ticket.subject,
            ticket.description ?? null,
            ticket.status,
            ticket.priority,
            ticket.assignee ?? null,
            ticket.resolution ?? null,
            ticket.resolvedDate ?? null,
            JSON.stringify(
              ticket.metadata ?? {},
            ),
            ticket.updatedAt,
            ticket.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Ticket "${ticket.id}" was not found.`,
        );
      }

      return ticket;
    }

    if (
      !this.tickets.has(
        ticket.id,
      )
    ) {
      throw new Error(
        `Ticket "${ticket.id}" was not found.`,
      );
    }

    this.tickets.set(
      ticket.id,
      ticket,
    );

    return ticket;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM support_tickets
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Ticket "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.tickets.delete(id);

    if (!deleted) {
      throw new Error(
        `Ticket "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a ticket record.
   */
  private mapRow(
    row: TicketRow,
  ): TicketRecord {
    return {
      id: row.id,
      number: row.number,
      clientId: row.client_id,
      projectId:
        row.project_id ?? undefined,
      hostingAccountId:
        row.hosting_account_id ??
        undefined,
      subject: row.subject,
      description:
        row.description ?? undefined,
      status:
        row.status as TicketStatus,
      priority:
        row.priority as TicketPriority,
      assignee:
        row.assignee ?? undefined,
      resolution:
        row.resolution ?? undefined,
      resolvedDate:
        row.resolved_date ?? undefined,
      metadata:
        this.parseMetadata(
          row.metadata_json,
        ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Safely parses ticket metadata stored as JSON.
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
