import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformCampaignRecord,
  PlatformCampaignStatus,
} from "./PlatformCampaign";

interface CampaignRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  channel: string | null;
  status: string;
  audience: string | null;
  budget: number | null;
  spend: number | null;
  start_date: string | null;
  end_date: string | null;
  owner: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores marketing campaigns, always scoped to the current tenant. Same
 * isolation contract as every tenant-scoped repository.
 */
export class PlatformCampaignRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformCampaignRecord
    >();

  async create(
    campaign: Omit<
      PlatformCampaignRecord,
      "organizationId"
    >,
  ): Promise<PlatformCampaignRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformCampaignRecord =
      { ...campaign, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO campaigns
           (id, organization_id, client_id, name, channel, status, audience,
            budget, spend, start_date, end_date, owner, notes,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.name,
          record.channel ?? null,
          record.status,
          record.audience ?? null,
          record.budget ?? null,
          record.spend ?? null,
          record.startDate ?? null,
          record.endDate ?? null,
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
    PlatformCampaignRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2",
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

  async list(): Promise<
    PlatformCampaignRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM campaigns
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is CampaignRow =>
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
    campaign: PlatformCampaignRecord,
  ): Promise<PlatformCampaignRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE campaigns
            SET client_id = $3, name = $4, channel = $5, status = $6,
                audience = $7, budget = $8, spend = $9, start_date = $10,
                end_date = $11, owner = $12, notes = $13, updated_at = $14
          WHERE id = $1 AND organization_id = $2`,
        [
          campaign.id,
          organizationId,
          campaign.clientId ?? null,
          campaign.name,
          campaign.channel ?? null,
          campaign.status,
          campaign.audience ?? null,
          campaign.budget ?? null,
          campaign.spend ?? null,
          campaign.startDate ?? null,
          campaign.endDate ?? null,
          campaign.owner ?? null,
          campaign.notes ?? null,
          campaign.updatedAt,
        ],
      );

      return campaign;
    }

    const existing = this.memory.get(
      campaign.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        campaign.id,
        campaign,
      );
    }

    return campaign;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM campaigns WHERE id = $1 AND organization_id = $2",
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
): CampaignRow | undefined {
  return row as CampaignRow | undefined;
}

function mapRow(
  row: CampaignRow,
): PlatformCampaignRecord {
  const record: PlatformCampaignRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      status:
        row.status as PlatformCampaignStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.channel)
    record.channel = row.channel;
  if (row.audience)
    record.audience = row.audience;
  if (
    row.budget !== null &&
    row.budget !== undefined
  )
    record.budget = Number(
      row.budget,
    );
  if (
    row.spend !== null &&
    row.spend !== undefined
  )
    record.spend = Number(row.spend);
  if (row.start_date)
    record.startDate = row.start_date;
  if (row.end_date)
    record.endDate = row.end_date;
  if (row.owner)
    record.owner = row.owner;
  if (row.notes)
    record.notes = row.notes;

  return record;
}
