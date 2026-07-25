import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isTicketPriority,
  isTicketStatus,
  type CreatePlatformTicketRequest,
  type PlatformTicketRecord,
  type UpdatePlatformTicketRequest,
} from "./PlatformTicket";
import { PlatformTicketRepository } from "./PlatformTicketRepository";

/**
 * Manages support tickets for the acting tenant.
 *
 * When a ticket references a client, the reference is validated through the
 * tenant-scoped client service — which only ever sees the current
 * organization's clients. So attaching a ticket to another tenant's client
 * is impossible: that client simply "does not exist" from here.
 */
export class PlatformTicketService {
  constructor(
    private readonly repository =
      new PlatformTicketRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformTicketRequest,
  ): Promise<PlatformTicketRecord> {
    const subject =
      request.subject.trim();

    if (!subject) {
      throw new Error(
        "A ticket needs a subject.",
      );
    }

    if (request.clientId) {
      await this.assertClientInTenant(
        request.clientId,
      );
    }

    const now =
      new Date().toISOString();

    return this.repository.create({
      id: randomUUID(),
      clientId: request.clientId,
      subject,
      description:
        request.description?.trim() ||
        undefined,
      status: isTicketStatus(
        request.status,
      )
        ? request.status
        : "open",
      priority: isTicketPriority(
        request.priority,
      )
        ? request.priority
        : "medium",
      assignee:
        request.assignee?.trim() ||
        undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformTicketRecord> {
    const ticket =
      await this.repository.get(id);

    if (!ticket) {
      throw new Error(
        "Ticket not found.",
      );
    }

    return ticket;
  }

  async list(): Promise<
    readonly PlatformTicketRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformTicketRequest,
  ): Promise<PlatformTicketRecord> {
    const existing =
      await this.get(id);

    if (changes.clientId) {
      await this.assertClientInTenant(
        changes.clientId,
      );
    }

    const clientId =
      changes.clientId === null
        ? undefined
        : (changes.clientId ??
          existing.clientId);

    const updated: PlatformTicketRecord =
      {
        ...existing,
        clientId,
        subject:
          changes.subject?.trim() ||
          existing.subject,
        description:
          changes.description !==
          undefined
            ? changes.description.trim() ||
              undefined
            : existing.description,
        status: isTicketStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
        priority: isTicketPriority(
          changes.priority,
        )
          ? changes.priority
          : existing.priority,
        assignee:
          changes.assignee !==
          undefined
            ? changes.assignee.trim() ||
              undefined
            : existing.assignee,
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.repository.delete(id);
  }

  private async assertClientInTenant(
    clientId: string,
  ): Promise<void> {
    if (!this.clients) {
      throw new Error(
        "Cannot attach a client: client service is unavailable.",
      );
    }

    await this.clients.get(clientId);
  }
}
