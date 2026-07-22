import { randomUUID } from "node:crypto";

import type {
  CreatePlatformClientRequest,
  PlatformClientRecord,
  UpdatePlatformClientRequest,
} from "./PlatformClient";
import { PlatformClientRepository } from "./PlatformClientRepository";

/**
 * Manages clients for the acting tenant. The service never sees or sets
 * an organization id — the repository stamps and enforces it from the
 * tenant context — so every operation is automatically confined to the
 * current organization.
 */
export class PlatformClientService {
  constructor(
    private readonly repository =
      new PlatformClientRepository(),
  ) {}

  async create(
    request: CreatePlatformClientRequest,
  ): Promise<PlatformClientRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A client requires a name.",
      );
    }

    const now =
      new Date().toISOString();

    return this.repository.create({
      id: randomUUID(),
      name,
      email:
        request.email?.trim() ||
        undefined,
      company:
        request.company?.trim() ||
        undefined,
      status:
        request.status ?? "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformClientRecord> {
    const client =
      await this.repository.get(id);

    if (!client) {
      throw new Error(
        "Client not found.",
      );
    }

    return client;
  }

  async list(): Promise<
    readonly PlatformClientRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformClientRequest,
  ): Promise<PlatformClientRecord> {
    const existing =
      await this.get(id);

    const updated: PlatformClientRecord =
      {
        ...existing,
        name:
          changes.name?.trim() ||
          existing.name,
        email:
          changes.email !== undefined
            ? changes.email.trim() ||
              undefined
            : existing.email,
        company:
          changes.company !==
          undefined
            ? changes.company.trim() ||
              undefined
            : existing.company,
        status:
          changes.status ??
          existing.status,
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
}
