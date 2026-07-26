import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { EmailStatus } from "../../communications/EmailTypes";
import type { PlatformEmailRecord } from "./PlatformEmail";

interface EmailRow {
  id: string;
  organization_id: string;
  to_address: string;
  subject: string;
  body: string;
  from_address: string;
  status: string;
  provider: string;
  error: string | null;
  created_at: string;
}

/**
 * Stores the tenant's email outbox, always scoped to the current tenant.
 */
export class PlatformEmailRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformEmailRecord
    >();

  async create(
    email: Omit<
      PlatformEmailRecord,
      "organizationId"
    >,
  ): Promise<PlatformEmailRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformEmailRecord =
      { ...email, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO emails
           (id, organization_id, to_address, subject, body, from_address,
            status, provider, error, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          record.id,
          record.organizationId,
          record.to,
          record.subject,
          record.body,
          record.from,
          record.status,
          record.provider,
          record.error ?? null,
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

  async list(): Promise<
    PlatformEmailRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM emails
            WHERE organization_id = $1
            ORDER BY created_at DESC
            LIMIT 200`,
          [organizationId],
        );

      return (
        result.rows as unknown as EmailRow[]
      ).map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (e) =>
        e.organizationId ===
        organizationId,
    );
  }
}

function mapRow(
  row: EmailRow,
): PlatformEmailRecord {
  const record: PlatformEmailRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      to: row.to_address,
      subject: row.subject,
      body: row.body,
      from: row.from_address,
      status:
        row.status as EmailStatus,
      provider: row.provider,
      createdAt: row.created_at,
    };

  if (row.error) {
    record.error = row.error;
  }

  return record;
}
