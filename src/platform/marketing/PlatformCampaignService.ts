import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isCampaignStatus,
  normalizeAmount,
  type CreatePlatformCampaignRequest,
  type PlatformCampaignRecord,
  type UpdatePlatformCampaignRequest,
} from "./PlatformCampaign";
import { PlatformCampaignRepository } from "./PlatformCampaignRepository";

/**
 * Manages marketing campaigns for the acting tenant. A referenced client is
 * validated through the tenant-scoped client service, so a campaign can never
 * reference another tenant's client.
 */
export class PlatformCampaignService {
  constructor(
    private readonly repository =
      new PlatformCampaignRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformCampaignRequest,
  ): Promise<PlatformCampaignRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A campaign needs a name.",
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
      name,
      channel:
        request.channel?.trim() ||
        undefined,
      status: isCampaignStatus(
        request.status,
      )
        ? request.status
        : "planned",
      audience:
        request.audience?.trim() ||
        undefined,
      budget: normalizeAmount(
        request.budget,
      ),
      spend: normalizeAmount(
        request.spend,
      ),
      startDate:
        request.startDate?.trim() ||
        undefined,
      endDate:
        request.endDate?.trim() ||
        undefined,
      owner:
        request.owner?.trim() ||
        undefined,
      notes:
        request.notes?.trim() ||
        undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformCampaignRecord> {
    const campaign =
      await this.repository.get(id);

    if (!campaign) {
      throw new Error(
        "Campaign not found.",
      );
    }

    return campaign;
  }

  async list(): Promise<
    readonly PlatformCampaignRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformCampaignRequest,
  ): Promise<PlatformCampaignRecord> {
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

    const updated: PlatformCampaignRecord =
      {
        ...existing,
        clientId,
        name:
          changes.name?.trim() ||
          existing.name,
        channel: text(
          changes.channel,
          existing.channel,
        ),
        status: isCampaignStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
        audience: text(
          changes.audience,
          existing.audience,
        ),
        budget:
          changes.budget !== undefined
            ? normalizeAmount(
                changes.budget,
              )
            : existing.budget,
        spend:
          changes.spend !== undefined
            ? normalizeAmount(
                changes.spend,
              )
            : existing.spend,
        startDate: text(
          changes.startDate,
          existing.startDate,
        ),
        endDate: text(
          changes.endDate,
          existing.endDate,
        ),
        owner: text(
          changes.owner,
          existing.owner,
        ),
        notes: text(
          changes.notes,
          existing.notes,
        ),
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

function text(
  change: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (change === undefined) {
    return existing;
  }

  return change.trim() || undefined;
}
