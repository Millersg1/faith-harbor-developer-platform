import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { CampaignRecord } from "./CampaignRecord";
import { CampaignRepository } from "./CampaignRepository";
import type { CampaignRequest } from "./CampaignRequest";

/**
 * Creates and manages marketing campaigns.
 */
export class CampaignService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new CampaignRepository(),
  ) {}

  /**
   * Creates and stores a new campaign.
   */
  create(
    request: CampaignRequest,
  ): CampaignRecord {
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
        "A campaign requires a name.",
      );
    }

    const now =
      new Date().toISOString();

    const campaign: CampaignRecord = {
      id: randomUUID(),

      clientId:
        request.clientId,

      name,

      channel:
        request.channel,

      status:
        request.status ??
        "planned",

      audience:
        request.audience,

      budget:
        request.budget,

      spend:
        request.spend,

      leads:
        request.leads,

      startDate:
        request.startDate,

      endDate:
        request.endDate,

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
      campaign,
    );
  }

  /**
   * Returns every campaign.
   */
  list(): readonly CampaignRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one campaign.
   */
  get(
    campaignId: string,
  ): CampaignRecord {
    return this.repository.get(
      campaignId,
    );
  }

  /**
   * Returns all campaigns for one client.
   */
  listForClient(
    clientId: string,
  ): readonly CampaignRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing campaign.
   */
  update(
    campaign: CampaignRecord,
  ): CampaignRecord {
    if (campaign.clientId) {
      this.clients.get(
        campaign.clientId,
      );
    }

    return this.repository.update({
      ...campaign,
      name: campaign.name.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a campaign.
   */
  delete(
    campaignId: string,
  ): void {
    this.repository.delete(
      campaignId,
    );
  }
}
