import { randomUUID } from "node:crypto";

import {
  hashPassword,
  verifyPassword,
} from "../auth/password";
import type {
  CreatePlatformAdminRequest,
  PlatformAdminRecord,
} from "./PlatformAdmin";
import { PlatformAdminRepository } from "./PlatformAdminRepository";

/**
 * Manages platform administrators and their authentication. Admins are
 * global (not tenant-scoped): authenticate matches across the whole
 * platform, and there is no organization context.
 */
export class PlatformAdminService {
  constructor(
    private readonly repository =
      new PlatformAdminRepository(),
  ) {}

  async create(
    request: CreatePlatformAdminRequest,
  ): Promise<PlatformAdminRecord> {
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
        "A platform admin with that email already exists.",
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
      createdAt: now,
      updatedAt: now,
    });
  }

  async authenticate(
    email: string,
    password: string,
  ): Promise<PlatformAdminRecord> {
    const invalid = new Error(
      "Invalid email or password.",
    );

    const admin =
      await this.repository.findByEmail(
        email.trim().toLowerCase(),
      );

    if (!admin) {
      throw invalid;
    }

    if (
      !verifyPassword(
        password,
        admin.passwordHash,
      )
    ) {
      throw invalid;
    }

    return admin;
  }

  async get(
    id: string,
  ): Promise<PlatformAdminRecord> {
    const admin =
      await this.repository.get(id);

    if (!admin) {
      throw new Error(
        "Admin not found.",
      );
    }

    return admin;
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  /**
   * Creates the first admin if none exists yet — used to bootstrap a
   * platform from environment configuration. No-op if any admin exists.
   */
  async ensureBootstrapAdmin(
    email: string,
    password: string,
    name?: string,
  ): Promise<boolean> {
    if (
      (await this.repository.count()) >
      0
    ) {
      return false;
    }

    await this.create({
      email,
      password,
      name,
    });

    return true;
  }
}
