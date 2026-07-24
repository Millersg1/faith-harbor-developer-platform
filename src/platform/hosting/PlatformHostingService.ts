import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isValidHostingDomain,
  normalizeHostingDomain,
  type CreatePlatformHostingRequest,
  type PlatformHostingAccountRecord,
  type UpdatePlatformHostingRequest,
} from "./PlatformHostingAccount";
import { PlatformHostingRepository } from "./PlatformHostingRepository";

/**
 * Manages hosting accounts (hosted websites) for the acting tenant.
 *
 * When an account references a client, the reference is validated through
 * the tenant-scoped client service — which only ever sees the current
 * organization's clients. So attaching a site to another tenant's client
 * is impossible: that client simply "does not exist" from here.
 */
export class PlatformHostingService {
  constructor(
    private readonly repository =
      new PlatformHostingRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformHostingRequest,
  ): Promise<PlatformHostingAccountRecord> {
    const domain =
      normalizeHostingDomain(
        request.domain,
      );

    if (
      !isValidHostingDomain(domain)
    ) {
      throw new Error(
        "Enter a valid domain, like yoursite.com.",
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
      domain,
      plan:
        request.plan?.trim() ||
        undefined,
      status:
        request.status ?? "pending",
      notes:
        request.notes?.trim() ||
        undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformHostingAccountRecord> {
    const account =
      await this.repository.get(id);

    if (!account) {
      throw new Error(
        "Hosting account not found.",
      );
    }

    return account;
  }

  async list(): Promise<
    readonly PlatformHostingAccountRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformHostingRequest,
  ): Promise<PlatformHostingAccountRecord> {
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

    let domain = existing.domain;

    if (changes.domain !== undefined) {
      const next =
        normalizeHostingDomain(
          changes.domain,
        );

      if (
        !isValidHostingDomain(next)
      ) {
        throw new Error(
          "Enter a valid domain, like yoursite.com.",
        );
      }

      domain = next;
    }

    const updated: PlatformHostingAccountRecord =
      {
        ...existing,
        clientId,
        domain,
        plan:
          changes.plan !== undefined
            ? changes.plan.trim() ||
              undefined
            : existing.plan,
        status:
          changes.status ??
          existing.status,
        notes:
          changes.notes !== undefined
            ? changes.notes.trim() ||
              undefined
            : existing.notes,
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

  /** How many hosting accounts (sites) the tenant currently has. */
  async count(): Promise<number> {
    return (
      await this.repository.list()
    ).length;
  }

  /**
   * Confirms a client id belongs to the acting tenant. Throws when it
   * doesn't (or when no client service is wired), which is what blocks a
   * site from referencing another organization's client.
   */
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
