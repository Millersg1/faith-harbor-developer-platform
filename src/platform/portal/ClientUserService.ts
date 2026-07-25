import { randomUUID } from "node:crypto";

import {
  hashPassword,
  verifyPassword,
} from "../auth/password";
import type { PlatformClientService } from "../clients/PlatformClientService";
import type { ClientUserRecord } from "./ClientUser";
import { ClientUserRepository } from "./ClientUserRepository";

/**
 * Manages client-portal logins for the acting tenant. Creating a login
 * validates that the client belongs to the tenant (via the tenant-scoped
 * client service), so a portal login can never point at another tenant's
 * client. Authentication is tenant-scoped, so the same email in a different
 * tenant is a different account.
 */
export class ClientUserService {
  constructor(
    private readonly repository =
      new ClientUserRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(request: {
    clientId: string;
    email: string;
    password: string;
  }): Promise<ClientUserRecord> {
    const email = request.email
      .trim()
      .toLowerCase();

    if (!email.includes("@")) {
      throw new Error(
        "A valid email is required.",
      );
    }

    if (
      !request.password ||
      request.password.length < 8
    ) {
      throw new Error(
        "Password must be at least 8 characters.",
      );
    }

    // The client must belong to this tenant.
    if (this.clients) {
      await this.clients.get(
        request.clientId,
      );
    }

    const existing =
      await this.repository.findByEmail(
        email,
      );

    if (existing) {
      throw new Error(
        "A portal login with that email already exists.",
      );
    }

    return this.repository.create({
      id: randomUUID(),
      clientId: request.clientId,
      email,
      passwordHash: hashPassword(
        request.password,
      ),
      createdAt:
        new Date().toISOString(),
    });
  }

  /**
   * Verifies portal credentials within the current tenant. Returns the
   * client user, or throws a uniform error for an unknown email or wrong
   * password (so it can't be used to probe which emails exist).
   */
  async authenticate(
    email: string,
    password: string,
  ): Promise<ClientUserRecord> {
    const invalid = new Error(
      "Invalid email or password.",
    );

    const user =
      await this.repository.findByEmail(
        email.trim().toLowerCase(),
      );

    if (!user) {
      throw invalid;
    }

    if (
      !verifyPassword(
        password,
        user.passwordHash,
      )
    ) {
      throw invalid;
    }

    return user;
  }

  async list(): Promise<
    readonly ClientUserRecord[]
  > {
    return this.repository.list();
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.repository.delete(id);
  }
}
