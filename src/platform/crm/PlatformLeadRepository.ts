import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformLeadRecord,
  PlatformLeadStatus,
} from "./PlatformLead";

interface LeadRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  service_interest: string | null;
  estimated_value: number | null;
  status: string;
  owner: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores sales leads, always scoped to the current tenant. Same isolation
 * contract as every tenant-scoped repository: resolve the organization from
 * context (fail closed) and constrain every query to it.
 */
export class PlatformLeadRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformLeadRecord
    >();

  async create(
    lead: Omit<
      PlatformLeadRecord,
      "organizationId"
    >,
  ): Promise<PlatformLeadRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformLeadRecord =
      { ...lead, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO leads
           (id, organization_id, client_id, name, company, email, phone,
            source, service_interest, estimated_value, status, owner, notes,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.name,
          record.company ?? null,
          record.email ?? null,
          record.phone ?? null,
          record.source ?? null,
          record.serviceInterest ??
            null,
          record.estimatedValue ??
            null,
          record.status,
          record.owner ?? null,
          record.notes ?? null,
          record.createdAt,
          record.updatedAt,
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

  async get(
    id: string,
  ): Promise<
    PlatformLeadRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM leads WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    const record = this.memory.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  /**
   * Find the most-recent lead in THIS tenant with a matching (case-insensitive)
   * email. Tenant-scoped — never matches across organizations. Used for
   * safe lead merge on repeat public submissions.
   */
  async findByEmail(
    email: string,
  ): Promise<PlatformLeadRecord | undefined> {
    const organizationId = this.tenantId();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return undefined;

    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM leads
           WHERE organization_id = $1 AND LOWER(email) = $2
           ORDER BY created_at DESC LIMIT 1`,
        [organizationId, normalized],
      );
      const row = asRow(result.rows[0]);
      return row ? mapRow(row) : undefined;
    }

    return [...this.memory.values()]
      .filter(
        (l) =>
          l.organizationId === organizationId &&
          (l.email ?? "").trim().toLowerCase() === normalized,
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  }

  async list(): Promise<
    PlatformLeadRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM leads
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (row): row is LeadRow =>
            row !== undefined,
        )
        .map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (record) =>
        record.organizationId ===
        organizationId,
    );
  }

  async update(
    lead: PlatformLeadRecord,
  ): Promise<PlatformLeadRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE leads
            SET client_id = $3, name = $4, company = $5, email = $6,
                phone = $7, source = $8, service_interest = $9,
                estimated_value = $10, status = $11, owner = $12,
                notes = $13, updated_at = $14
          WHERE id = $1 AND organization_id = $2`,
        [
          lead.id,
          organizationId,
          lead.clientId ?? null,
          lead.name,
          lead.company ?? null,
          lead.email ?? null,
          lead.phone ?? null,
          lead.source ?? null,
          lead.serviceInterest ??
            null,
          lead.estimatedValue ?? null,
          lead.status,
          lead.owner ?? null,
          lead.notes ?? null,
          lead.updatedAt,
        ],
      );

      return lead;
    }

    const existing = this.memory.get(
      lead.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(lead.id, lead);
    }

    return lead;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM leads WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing = this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): LeadRow | undefined {
  return row as LeadRow | undefined;
}

function mapRow(
  row: LeadRow,
): PlatformLeadRecord {
  const record: PlatformLeadRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    name: row.name,
    status:
      row.status as PlatformLeadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.company)
    record.company = row.company;
  if (row.email)
    record.email = row.email;
  if (row.phone)
    record.phone = row.phone;
  if (row.source)
    record.source = row.source;
  if (row.service_interest)
    record.serviceInterest =
      row.service_interest;
  if (
    row.estimated_value !== null &&
    row.estimated_value !== undefined
  )
    record.estimatedValue = Number(
      row.estimated_value,
    );
  if (row.owner)
    record.owner = row.owner;
  if (row.notes)
    record.notes = row.notes;

  return record;
}
