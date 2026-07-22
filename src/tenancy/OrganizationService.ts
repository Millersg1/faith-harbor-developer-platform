import { randomUUID } from "node:crypto";

import {
  normalizeSlug,
  type CreateOrganizationRequest,
  type OrganizationRecord,
} from "./Organization";
import { OrganizationRepository } from "./OrganizationRepository";

/**
 * Creates and manages organizations (tenants) — the root of the
 * multi-tenant model. Everything else in the platform will hang off an
 * organization id. Slugs are unique so each tenant gets a stable
 * subdomain.
 */
export class OrganizationService {
  constructor(
    private readonly repository =
      new OrganizationRepository(),
  ) {}

  /**
   * Creates a new organization. Derives a slug from the name when one
   * isn't given, and rejects a slug that is already taken so tenant
   * subdomains never collide.
   */
  async create(
    request: CreateOrganizationRequest,
  ): Promise<OrganizationRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "An organization requires a name.",
      );
    }

    const slug = normalizeSlug(
      request.slug?.trim() || name,
    );

    if (!slug) {
      throw new Error(
        "An organization requires a valid slug (letters or numbers).",
      );
    }

    const existing =
      await this.repository.findBySlug(
        slug,
      );

    if (existing) {
      throw new Error(
        `The organization slug "${slug}" is already in use.`,
      );
    }

    const now =
      new Date().toISOString();

    const organization: OrganizationRecord =
      {
        id: randomUUID(),
        name,
        slug,
        status:
          request.status ?? "active",
        createdAt: now,
        updatedAt: now,
      };

    return this.repository.create(
      organization,
    );
  }

  /**
   * Returns one organization, throwing when it does not exist.
   */
  async get(
    id: string,
  ): Promise<OrganizationRecord> {
    const organization =
      await this.repository.get(id);

    if (!organization) {
      throw new Error(
        "Organization not found.",
      );
    }

    return organization;
  }

  /**
   * Resolves an organization by its slug (e.g. from a subdomain).
   * Returns undefined when no tenant matches.
   */
  async getBySlug(
    slug: string,
  ): Promise<
    OrganizationRecord | undefined
  > {
    return this.repository.findBySlug(
      normalizeSlug(slug),
    );
  }

  /**
   * Returns every organization (platform-admin view).
   */
  async list(): Promise<
    readonly OrganizationRecord[]
  > {
    return this.repository.list();
  }

  /**
   * Updates an organization's name or status. The slug is immutable
   * here to keep tenant subdomains stable.
   */
  async update(
    id: string,
    changes: {
      name?: string;
      status?: OrganizationRecord["status"];
    },
  ): Promise<OrganizationRecord> {
    const organization =
      await this.get(id);

    const updated: OrganizationRecord =
      {
        ...organization,
        name:
          changes.name?.trim() ||
          organization.name,
        status:
          changes.status ??
          organization.status,
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }
}
