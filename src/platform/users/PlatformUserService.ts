import { randomUUID } from "node:crypto";

import {
  hashPassword,
  verifyPassword,
} from "../auth/password";
import type {
  CreatePlatformUserRequest,
  PlatformUserRecord,
} from "./PlatformUser";
import { PlatformUserRepository } from "./PlatformUserRepository";

/**
 * Manages users for the acting tenant, including authentication.
 *
 * Every lookup is tenant-scoped, so `authenticate` can only ever match a
 * user inside the organization the request is for — the same email in a
 * different tenant is a different account and cannot be logged into from
 * here.
 */
export class PlatformUserService {
  constructor(
    private readonly repository =
      new PlatformUserRepository(),
  ) {}

  async create(
    request: CreatePlatformUserRequest,
  ): Promise<PlatformUserRecord> {
    const email = request.email
      .trim()
      .toLowerCase();

    if (
      !email ||
      !email.includes("@")
    ) {
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

    const existing =
      await this.repository.findByEmail(
        email,
      );

    if (existing) {
      throw new Error(
        "A user with that email already exists in this organization.",
      );
    }

    const now =
      new Date().toISOString();

    return this.repository.create({
      id: randomUUID(),
      email,
      passwordHash: hashPassword(
        request.password,
      ),
      name:
        request.name?.trim() ||
        undefined,
      role: request.role ?? "member",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Verifies credentials against a user in the current tenant. Throws a
   * uniform error for an unknown email or a wrong password (so it can't
   * be used to discover which emails exist); a suspended account is only
   * revealed once the password is known to be correct.
   */
  async authenticate(
    email: string,
    password: string,
  ): Promise<PlatformUserRecord> {
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

    if (user.status !== "active") {
      throw new Error(
        "This account is suspended.",
      );
    }

    return user;
  }

  async get(
    id: string,
  ): Promise<PlatformUserRecord> {
    const user =
      await this.repository.get(id);

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    return user;
  }

  async list(): Promise<
    readonly PlatformUserRecord[]
  > {
    return this.repository.list();
  }
}
