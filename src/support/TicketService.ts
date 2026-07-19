import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { TicketRecord } from "./TicketRecord";
import { TicketRepository } from "./TicketRepository";
import type { TicketRequest } from "./TicketRequest";

/**
 * Creates and manages client support tickets.
 */
export class TicketService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new TicketRepository(),
  ) {}

  /**
   * Creates and stores a new support ticket.
   */
  create(
    request: TicketRequest,
  ): TicketRecord {
    // Ensure the client exists.
    this.clients.get(request.clientId);

    const subject =
      request.subject.trim();

    if (!subject) {
      throw new Error(
        "A support ticket requires a subject.",
      );
    }

    const now =
      new Date().toISOString();

    const ticket: TicketRecord = {
      id: randomUUID(),

      number:
        request.number?.trim() ||
        this.nextTicketNumber(),

      clientId: request.clientId,

      projectId:
        request.projectId,

      hostingAccountId:
        request.hostingAccountId,

      subject,

      description:
        request.description,

      status:
        request.status ??
        "open",

      priority:
        request.priority ??
        "medium",

      assignee:
        request.assignee,

      resolution:
        request.resolution,

      resolvedDate:
        request.resolvedDate,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      ticket,
    );
  }

  /**
   * Returns every ticket.
   */
  list(): readonly TicketRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one ticket.
   */
  get(
    ticketId: string,
  ): TicketRecord {
    return this.repository.get(
      ticketId,
    );
  }

  /**
   * Returns all tickets for one client.
   */
  listForClient(
    clientId: string,
  ): readonly TicketRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing ticket.
   */
  update(
    ticket: TicketRecord,
  ): TicketRecord {
    this.clients.get(ticket.clientId);

    return this.repository.update({
      ...ticket,
      subject:
        ticket.subject.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a ticket.
   */
  delete(
    ticketId: string,
  ): void {
    this.repository.delete(
      ticketId,
    );
  }

  /**
   * Generates the next sequential ticket number.
   */
  private nextTicketNumber(): string {
    const next =
      this.repository.count() + 1;

    return `TICKET-${String(next).padStart(4, "0")}`;
  }
}
