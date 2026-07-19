import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { LeadRecord } from "./LeadRecord";
import { LeadRepository } from "./LeadRepository";
import type { LeadRequest } from "./LeadRequest";

/**
 * Creates and manages sales leads.
 */
export class LeadService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new LeadRepository(),
  ) {}

  /**
   * Creates and stores a new lead.
   */
  create(
    request: LeadRequest,
  ): LeadRecord {
    // Validate the client only when one is supplied.
    if (request.clientId) {
      this.clients.get(
        request.clientId,
      );
    }

    const name =
      request.name.trim();

    if (!name) {
      throw new Error(
        "A lead requires a name.",
      );
    }

    const now =
      new Date().toISOString();

    const lead: LeadRecord = {
      id: randomUUID(),

      clientId:
        request.clientId,

      name,

      company:
        request.company,

      email:
        request.email,

      phone:
        request.phone,

      source:
        request.source,

      serviceInterest:
        request.serviceInterest,

      estimatedValue:
        request.estimatedValue,

      status:
        request.status ??
        "new",

      owner:
        request.owner,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      lead,
    );
  }

  /**
   * Returns every lead.
   */
  list(): readonly LeadRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one lead.
   */
  get(
    leadId: string,
  ): LeadRecord {
    return this.repository.get(
      leadId,
    );
  }

  /**
   * Returns all leads for one client.
   */
  listForClient(
    clientId: string,
  ): readonly LeadRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing lead.
   */
  update(
    lead: LeadRecord,
  ): LeadRecord {
    if (lead.clientId) {
      this.clients.get(
        lead.clientId,
      );
    }

    return this.repository.update({
      ...lead,
      name: lead.name.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a lead.
   */
  delete(
    leadId: string,
  ): void {
    this.repository.delete(
      leadId,
    );
  }
}
