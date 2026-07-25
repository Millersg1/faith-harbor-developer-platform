import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isProductStatus,
  type CreatePlatformProductRequest,
  type PlatformProductRecord,
  type UpdatePlatformProductRequest,
} from "./PlatformProduct";
import { PlatformProductRepository } from "./PlatformProductRepository";

/**
 * Manages products for the acting tenant. A referenced client is validated
 * through the tenant-scoped client service.
 */
export class PlatformProductService {
  constructor(
    private readonly repository =
      new PlatformProductRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformProductRequest,
  ): Promise<PlatformProductRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A product needs a name.",
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
      description: t(
        request.description,
      ),
      status: isProductStatus(
        request.status,
      )
        ? request.status
        : "planning",
      repoUrl: t(request.repoUrl),
      language: t(request.language),
      version: t(request.version),
      owner: t(request.owner),
      notes: t(request.notes),
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformProductRecord> {
    const product =
      await this.repository.get(id);

    if (!product) {
      throw new Error(
        "Product not found.",
      );
    }

    return product;
  }

  async list(): Promise<
    readonly PlatformProductRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformProductRequest,
  ): Promise<PlatformProductRecord> {
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

    const updated: PlatformProductRecord =
      {
        ...existing,
        clientId,
        name:
          changes.name?.trim() ||
          existing.name,
        description: u(
          changes.description,
          existing.description,
        ),
        status: isProductStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
        repoUrl: u(
          changes.repoUrl,
          existing.repoUrl,
        ),
        language: u(
          changes.language,
          existing.language,
        ),
        version: u(
          changes.version,
          existing.version,
        ),
        owner: u(
          changes.owner,
          existing.owner,
        ),
        notes: u(
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

function t(
  v: string | undefined,
): string | undefined {
  return v?.trim() || undefined;
}

function u(
  change: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (change === undefined)
    return existing;
  return change.trim() || undefined;
}
