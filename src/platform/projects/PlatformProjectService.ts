import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import type {
  CreatePlatformProjectRequest,
  PlatformProjectRecord,
  UpdatePlatformProjectRequest,
} from "./PlatformProject";
import { PlatformProjectRepository } from "./PlatformProjectRepository";

/**
 * Manages projects for the acting tenant.
 *
 * When a project references a client, the reference is validated through
 * the tenant-scoped client service — which only ever sees the current
 * organization's clients. So attaching a project to another tenant's
 * client is impossible: that client simply "does not exist" from here.
 */
export class PlatformProjectService {
  constructor(
    private readonly repository =
      new PlatformProjectRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformProjectRequest,
  ): Promise<PlatformProjectRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A project requires a name.",
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
      description:
        request.description?.trim() ||
        undefined,
      status:
        request.status ?? "active",
      dueDate: request.dueDate,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformProjectRecord> {
    const project =
      await this.repository.get(id);

    if (!project) {
      throw new Error(
        "Project not found.",
      );
    }

    return project;
  }

  async list(): Promise<
    readonly PlatformProjectRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformProjectRequest,
  ): Promise<PlatformProjectRecord> {
    const existing =
      await this.get(id);

    // Re-validate a newly attached client against the current tenant.
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

    const dueDate =
      changes.dueDate === null
        ? undefined
        : (changes.dueDate ??
          existing.dueDate);

    const updated: PlatformProjectRecord =
      {
        ...existing,
        clientId,
        name:
          changes.name?.trim() ||
          existing.name,
        description:
          changes.description !==
          undefined
            ? changes.description.trim() ||
              undefined
            : existing.description,
        status:
          changes.status ??
          existing.status,
        dueDate,
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

  /**
   * Confirms a client id belongs to the acting tenant. Throws when it
   * doesn't (or when no client service is wired), which is what blocks a
   * project from referencing another organization's client.
   */
  private async assertClientInTenant(
    clientId: string,
  ): Promise<void> {
    if (!this.clients) {
      throw new Error(
        "Cannot attach a client: client service is unavailable.",
      );
    }

    // get() is tenant-scoped and throws "Client not found" for any id
    // that isn't in the current organization.
    await this.clients.get(clientId);
  }
}
