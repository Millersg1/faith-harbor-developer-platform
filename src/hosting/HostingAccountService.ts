import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { HostingAccountRecord } from "./HostingAccountRecord";
import { HostingAccountRepository } from "./HostingAccountRepository";
import type { HostingAccountRequest } from "./HostingAccountRequest";

/**
 * Creates and manages hosting account records.
 */
export class HostingAccountService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new HostingAccountRepository(),
  ) {}

  /**
   * Creates and stores a new hosting account record.
   */
  create(
    request: HostingAccountRequest,
  ): HostingAccountRecord {
    // Validate the client only when one is supplied. Hosting
    // accounts may be recorded before being linked to a client.
    if (request.clientId) {
      this.clients.get(
        request.clientId,
      );
    }

    const domain =
      request.domain.trim();

    const username =
      request.username.trim();

    if (!domain) {
      throw new Error(
        "A hosting account requires a domain.",
      );
    }

    if (!username) {
      throw new Error(
        "A hosting account requires a username.",
      );
    }

    const now =
      new Date().toISOString();

    const account: HostingAccountRecord = {
      id: randomUUID(),

      clientId:
        request.clientId,

      brand:
        request.brand,

      domain,

      username,

      plan:
        request.plan,

      status:
        request.status ??
        "pending",

      server:
        request.server,

      ipAddress:
        request.ipAddress,

      diskUsedMb:
        request.diskUsedMb,

      diskLimitMb:
        request.diskLimitMb,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      account,
    );
  }

  /**
   * Returns every hosting account.
   */
  list(): readonly HostingAccountRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one hosting account.
   */
  get(
    accountId: string,
  ): HostingAccountRecord {
    return this.repository.get(
      accountId,
    );
  }

  /**
   * Returns all hosting accounts for one client.
   */
  listForClient(
    clientId: string,
  ): readonly HostingAccountRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing hosting account.
   */
  update(
    account: HostingAccountRecord,
  ): HostingAccountRecord {
    if (account.clientId) {
      this.clients.get(
        account.clientId,
      );
    }

    return this.repository.update({
      ...account,
      domain:
        account.domain.trim(),
      username:
        account.username.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a hosting account record.
   *
   * This removes only the Faith Harbor OS record. It never
   * terminates the live cPanel account.
   */
  delete(
    accountId: string,
  ): void {
    this.repository.delete(
      accountId,
    );
  }
}
