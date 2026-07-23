import { randomUUID } from "node:crypto";

import {
  isValidDomain,
  normalizeDomain,
  type OrganizationDomainRecord,
} from "./OrganizationDomain";
import { OrganizationDomainRepository } from "./OrganizationDomainRepository";
import { requireTenant } from "./TenantContext";

/**
 * Manages custom (white-label) domains.
 *
 * Adding, listing, and removing are tenant-scoped (an org only touches
 * its own domains). {@link resolve} is global — it maps an incoming
 * request host to the organization that owns it, which is how the tenant
 * is discovered in the first place, so it has no tenant context.
 */
export class OrganizationDomainService {
  constructor(
    private readonly repository =
      new OrganizationDomainRepository(),
  ) {}

  async add(
    rawDomain: string,
  ): Promise<OrganizationDomainRecord> {
    const organizationId =
      requireTenant().organizationId;

    const domain =
      normalizeDomain(rawDomain);

    if (!isValidDomain(domain)) {
      throw new Error(
        "Enter a valid domain, like cloud.yourbrand.com.",
      );
    }

    const existing =
      await this.repository.findByDomain(
        domain,
      );

    if (existing) {
      // Re-adding your own domain is a no-op; another tenant's is blocked.
      if (
        existing.organizationId ===
        organizationId
      ) {
        return existing;
      }

      throw new Error(
        "That domain is already in use.",
      );
    }

    return this.repository.create({
      id: randomUUID(),
      organizationId,
      domain,
      verified: false,
      createdAt:
        new Date().toISOString(),
    });
  }

  async listMine(): Promise<
    OrganizationDomainRecord[]
  > {
    return this.repository.findByOrganization(
      requireTenant().organizationId,
    );
  }

  async remove(
    id: string,
  ): Promise<void> {
    await this.repository.delete(
      id,
      requireTenant().organizationId,
    );
  }

  /**
   * Resolves a request host to its owning organization id (or undefined).
   * Global; used by the tenant middleware before any tenant is known.
   */
  async resolve(
    host: string,
  ): Promise<string | undefined> {
    const domain =
      normalizeDomain(host);

    if (!domain) {
      return undefined;
    }

    const record =
      await this.repository.findByDomain(
        domain,
      );

    return record?.organizationId;
  }
}
