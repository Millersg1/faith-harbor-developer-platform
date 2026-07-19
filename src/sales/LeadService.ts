import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";
import type { ClientRecord } from "../clients/ClientTypes";

import type { LeadRecord } from "./LeadRecord";
import { LeadRepository } from "./LeadRepository";
import type { LeadRequest } from "./LeadRequest";

/**
 * The result of converting a lead into a client.
 */
export interface LeadConversion {
  client: ClientRecord;
  lead: LeadRecord;
}

/**
 * Notified after a lead is created.
 *
 * The automation engine uses this to prepare a welcome-email draft.
 * It is optional so the sales module has no hard dependency on
 * automation, and failures here never block lead creation.
 */
export type LeadCreatedHook = (
  lead: LeadRecord,
) => void;

/**
 * Creates and manages sales leads.
 */
export class LeadService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new LeadRepository(),
    private readonly onLeadCreated?: LeadCreatedHook,
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

      campaignId:
        request.campaignId,

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

    const created =
      this.repository.create(lead);

    // Best-effort: notify the automation engine. A drafting failure
    // must never prevent the lead itself from being saved.
    if (this.onLeadCreated) {
      try {
        this.onLeadCreated(created);
      } catch {
        // Intentionally ignored; the lead is already stored.
      }
    }

    return created;
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
   * Returns all leads attributed to one campaign.
   */
  listForCampaign(
    campaignId: string,
  ): readonly LeadRecord[] {
    return this.repository.findByCampaignId(
      campaignId,
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
   * Converts a lead into a client.
   *
   * Creates a client from the lead's contact details, links the
   * lead to the new client, and marks the lead as won. This is the
   * front of the Faith Harbor pipeline: Sales -> Client Services.
   */
  convertToClient(
    leadId: string,
  ): LeadConversion {
    const lead =
      this.repository.get(leadId);

    if (lead.clientId) {
      throw new Error(
        "Lead is already linked to a client.",
      );
    }

    const client =
      this.clients.create({
        companyName:
          lead.company?.trim() ||
          lead.name,

        primaryContact: lead.name,

        email: lead.email,

        phone: lead.phone,

        notes:
          this.conversionNotes(lead),

        metadata: {
          convertedFromLeadId:
            lead.id,

          ...(lead.estimatedValue !==
          undefined
            ? {
                estimatedValue:
                  lead.estimatedValue,
              }
            : {}),
        },
      });

    const updatedLead =
      this.repository.update({
        ...lead,
        clientId: client.id,
        status: "won",
        updatedAt:
          new Date().toISOString(),
      });

    return {
      client,
      lead: updatedLead,
    };
  }

  private conversionNotes(
    lead: LeadRecord,
  ): string {
    const parts: string[] = [
      "Converted from a sales lead.",
    ];

    if (lead.source) {
      parts.push(
        `Source: ${lead.source}.`,
      );
    }

    if (lead.serviceInterest) {
      parts.push(
        `Interested in: ${lead.serviceInterest}.`,
      );
    }

    return parts.join(" ");
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
