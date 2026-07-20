import { randomUUID } from "node:crypto";

import {
  hashPassword,
  verifyPassword,
} from "../auth/AuthService";
import type { ClientService } from "../clients/ClientService";

import type { ClientUser } from "./ClientUser";
import { ClientUserRepository } from "./ClientUserRepository";

/**
 * Creates and authenticates client portal users.
 */
export class ClientUserService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new ClientUserRepository(),
  ) {}

  /**
   * Creates a portal login for a client (an administrator action).
   */
  createUser(input: {
    clientId: string;
    email: string;
    password: string;
  }): ClientUser {
    // The client must exist.
    this.clients.get(input.clientId);

    const email = input.email
      .trim()
      .toLowerCase();

    if (!email.includes("@")) {
      throw new Error(
        "A valid email is required.",
      );
    }

    if (
      input.password.length < 8
    ) {
      throw new Error(
        "The password must be at least 8 characters.",
      );
    }

    if (
      this.repository.findByEmail(
        email,
      )
    ) {
      throw new Error(
        "A portal user with that email already exists.",
      );
    }

    const user: ClientUser = {
      id: randomUUID(),
      clientId: input.clientId,
      email,
      passwordHash: hashPassword(
        input.password,
      ),
      createdAt:
        new Date().toISOString(),
    };

    return this.repository.create(
      user,
    );
  }

  /**
   * Verifies an email and password. Returns the user or null.
   */
  authenticate(
    email: string,
    password: string,
  ): ClientUser | null {
    const user =
      this.repository.findByEmail(
        email,
      );

    if (!user) {
      return null;
    }

    if (
      !verifyPassword(
        password,
        user.passwordHash,
      )
    ) {
      return null;
    }

    return user;
  }

  listForClient(
    clientId: string,
  ): ClientUser[] {
    return this.repository.findByClientId(
      clientId,
    );
  }
}
