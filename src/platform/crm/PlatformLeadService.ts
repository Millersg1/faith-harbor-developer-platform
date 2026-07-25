import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isLeadStatus,
  normalizeEstimatedValue,
  type CreatePlatformLeadRequest,
  type PlatformLeadRecord,
  type UpdatePlatformLeadRequest,
} from "./PlatformLead";
import { PlatformLeadRepository } from "./PlatformLeadRepository";

/**
 * Manages sales leads for the acting tenant.
 *
 * When a lead references a client, the reference is validated through the
 * tenant-scoped client service — which only ever sees the current
 * organization's clients. So attaching a lead to another tenant's client is
 * impossible: that client simply "does not exist" from here.
 */
export class PlatformLeadService {
  constructor(
    private readonly repository =
      new PlatformLeadRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformLeadRequest,
  ): Promise<PlatformLeadRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A lead needs a name.",
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
      company:
        request.company?.trim() ||
        undefined,
      email:
        request.email?.trim() ||
        undefined,
      phone:
        request.phone?.trim() ||
        undefined,
      source:
        request.source?.trim() ||
        undefined,
      serviceInterest:
        request.serviceInterest?.trim() ||
        undefined,
      estimatedValue:
        normalizeEstimatedValue(
          request.estimatedValue,
        ),
      status: isLeadStatus(
        request.status,
      )
        ? request.status
        : "new",
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
  ): Promise<PlatformLeadRecord> {
    const lead =
      await this.repository.get(id);

    if (!lead) {
      throw new Error(
        "Lead not found.",
      );
    }

    return lead;
  }

  async list(): Promise<
    readonly PlatformLeadRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformLeadRequest,
  ): Promise<PlatformLeadRecord> {
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

    const updated: PlatformLeadRecord =
      {
        ...existing,
        clientId,
        name:
          changes.name?.trim() ||
          existing.name,
        company: text(
          changes.company,
          existing.company,
        ),
        email: text(
          changes.email,
          existing.email,
        ),
        phone: text(
          changes.phone,
          existing.phone,
        ),
        source: text(
          changes.source,
          existing.source,
        ),
        serviceInterest: text(
          changes.serviceInterest,
          existing.serviceInterest,
        ),
        estimatedValue:
          changes.estimatedValue !==
          undefined
            ? normalizeEstimatedValue(
                changes.estimatedValue,
              )
            : existing.estimatedValue,
        status: isLeadStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
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

/** Applies a text change: present → trimmed-or-cleared; absent → keep. */
function text(
  change: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (change === undefined) {
    return existing;
  }

  return change.trim() || undefined;
}
