import { randomBytes, randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";

import {
  isValidDomain,
  normalizeDomain,
  verificationHost,
  verificationValue,
  type OrganizationDomainRecord,
} from "./OrganizationDomain";
import { OrganizationDomainRepository } from "./OrganizationDomainRepository";
import { requireTenant } from "./TenantContext";

/**
 * Looks up the TXT records for a host, returning each record as an array
 * of its chunks (matching node:dns' `resolveTxt`). Injectable so tests
 * never touch the real network.
 */
export type TxtResolver = (
  host: string,
) => Promise<string[][]>;

/**
 * Manages custom (white-label) domains.
 *
 * Adding, listing, and removing are tenant-scoped (an org only touches
 * its own domains). {@link resolve} is global — it maps an incoming
 * request host to the organization that owns it, which is how the tenant
 * is discovered in the first place, so it has no tenant context. A domain
 * only resolves once its owner has proven control via {@link verify}.
 */
export class OrganizationDomainService {
  private readonly txtResolver: TxtResolver;

  constructor(
    private readonly repository =
      new OrganizationDomainRepository(),
    options: {
      txtResolver?: TxtResolver;
    } = {},
  ) {
    this.txtResolver =
      options.txtResolver ?? resolveTxt;
  }

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
      verificationToken:
        randomBytes(16).toString("hex"),
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

  /**
   * Checks the domain's DNS TXT record and, if it matches the domain's
   * verification token, marks it verified. Tenant-scoped: you can only
   * verify a domain your own organization owns. Throws when the record
   * is missing or wrong so the caller can surface it to the user.
   */
  async verify(
    id: string,
  ): Promise<OrganizationDomainRecord> {
    const organizationId =
      requireTenant().organizationId;

    const record = (
      await this.repository.findByOrganization(
        organizationId,
      )
    ).find((r) => r.id === id);

    if (!record) {
      throw new Error(
        "Domain not found.",
      );
    }

    if (record.verified) {
      return record;
    }

    let records: string[][] = [];

    try {
      records = await this.txtResolver(
        verificationHost(record.domain),
      );
    } catch {
      // No record yet (ENOTFOUND/ENODATA) — treat as not-yet-verified.
      records = [];
    }

    const expected = verificationValue(
      record.verificationToken,
    );

    const found = records.some(
      (chunks) =>
        chunks.join("") === expected,
    );

    if (!found) {
      throw new Error(
        "We couldn't find the verification TXT record yet. Add it at your DNS provider and try again — changes can take a few minutes to propagate.",
      );
    }

    await this.repository.setVerified(
      id,
      organizationId,
      true,
    );

    return { ...record, verified: true };
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
   *
   * Only VERIFIED domains resolve — an unverified (unproven) domain must
   * never route traffic to a tenant, or anyone could point a domain at us
   * and hijack it.
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

    return record?.verified
      ? record.organizationId
      : undefined;
  }
}
