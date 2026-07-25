import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isProposalStatus,
  normalizeProposalAmount,
  type CreatePlatformProposalRequest,
  type PlatformProposalRecord,
  type UpdatePlatformProposalRequest,
} from "./PlatformProposal";
import { PlatformProposalRepository } from "./PlatformProposalRepository";

/**
 * Manages sales proposals for the acting tenant. A referenced client is
 * validated through the tenant-scoped client service, so a proposal can never
 * reference another tenant's client.
 */
export class PlatformProposalService {
  constructor(
    private readonly repository =
      new PlatformProposalRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformProposalRequest,
  ): Promise<PlatformProposalRecord> {
    const title = request.title.trim();

    if (!title) {
      throw new Error(
        "A proposal needs a title.",
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
      title,
      summary:
        request.summary?.trim() ||
        undefined,
      body:
        request.body?.trim() ||
        undefined,
      amount:
        normalizeProposalAmount(
          request.amount,
        ),
      status: isProposalStatus(
        request.status,
      )
        ? request.status
        : "draft",
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformProposalRecord> {
    const proposal =
      await this.repository.get(id);

    if (!proposal) {
      throw new Error(
        "Proposal not found.",
      );
    }

    return proposal;
  }

  async list(): Promise<
    readonly PlatformProposalRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformProposalRequest,
  ): Promise<PlatformProposalRecord> {
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

    const updated: PlatformProposalRecord =
      {
        ...existing,
        clientId,
        title:
          changes.title?.trim() ||
          existing.title,
        summary: text(
          changes.summary,
          existing.summary,
        ),
        body: text(
          changes.body,
          existing.body,
        ),
        amount:
          changes.amount !== undefined
            ? normalizeProposalAmount(
                changes.amount,
              )
            : existing.amount,
        status: isProposalStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
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
