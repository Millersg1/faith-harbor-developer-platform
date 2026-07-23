import type { PgQueryable } from "../persistence/PgQueryable";
import type { OrganizationDomainRecord } from "./OrganizationDomain";

interface DomainRow {
  id: string;
  organization_id: string;
  domain: string;
  verified: boolean | number;
  created_at: string;
}

/**
 * Stores custom domains. `findByDomain` is global (it's how a request's
 * host is resolved to a tenant), while the management queries are keyed
 * by organization so a tenant only ever sees or removes its own domains.
 */
export class OrganizationDomainRepository {
  private readonly memory =
    new Map<
      string,
      OrganizationDomainRecord
    >();

  constructor(
    private readonly db?: PgQueryable,
  ) {}

  async create(
    record: OrganizationDomainRecord,
  ): Promise<OrganizationDomainRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO organization_domains
           (id, organization_id, domain, verified, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          record.id,
          record.organizationId,
          record.domain,
          record.verified,
          record.createdAt,
        ],
      );

      return record;
    }

    this.memory.set(
      record.id,
      record,
    );

    return record;
  }

  /**
   * Resolves a host to its domain record — GLOBAL, not tenant-scoped,
   * because this is how the tenant itself is discovered.
   */
  async findByDomain(
    domain: string,
  ): Promise<
    OrganizationDomainRecord | undefined
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organization_domains WHERE domain = $1",
          [domain],
        );

      const row = result.rows[0] as
        | unknown as
        | DomainRow
        | undefined;

      return row
        ? mapRow(row)
        : undefined;
    }

    for (const record of this.memory.values()) {
      if (record.domain === domain) {
        return record;
      }
    }

    return undefined;
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<
    OrganizationDomainRecord[]
  > {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organization_domains WHERE organization_id = $1 ORDER BY created_at ASC",
          [organizationId],
        );

      return (
        result.rows as unknown as DomainRow[]
      ).map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (r) =>
        r.organizationId ===
        organizationId,
    );
  }

  /**
   * Deletes a domain, but only if it belongs to the given organization —
   * so one tenant can never remove another's domain.
   */
  async delete(
    id: string,
    organizationId: string,
  ): Promise<void> {
    if (this.db) {
      await this.db.query(
        "DELETE FROM organization_domains WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing =
      this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function mapRow(
  row: DomainRow,
): OrganizationDomainRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    domain: row.domain,
    verified:
      row.verified === true ||
      row.verified === 1,
    createdAt: row.created_at,
  };
}
