import type {
  DatabaseSync,
} from "node:sqlite";

import type { CampaignRecord } from "./CampaignRecord";
import type { CampaignStatus } from "./CampaignStatus";

interface CampaignRow {
  id: string;
  client_id: string | null;
  name: string;
  channel: string | null;
  status: string;
  audience: string | null;
  budget: number | null;
  spend: number | null;
  leads: number | null;
  start_date: string | null;
  end_date: string | null;
  owner: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves marketing campaign records.
 *
 * Without a database connection, campaigns are kept in memory.
 * When SQLite is supplied, campaigns persist across restarts.
 */
export class CampaignRepository {
  private readonly campaigns =
    new Map<string, CampaignRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    campaign: CampaignRecord,
  ): CampaignRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO campaigns (
            id,
            client_id,
            name,
            channel,
            status,
            audience,
            budget,
            spend,
            leads,
            start_date,
            end_date,
            owner,
            notes,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `)
        .run(
          campaign.id,
          campaign.clientId ?? null,
          campaign.name,
          campaign.channel ?? null,
          campaign.status,
          campaign.audience ?? null,
          campaign.budget ?? null,
          campaign.spend ?? null,
          campaign.leads ?? null,
          campaign.startDate ?? null,
          campaign.endDate ?? null,
          campaign.owner ?? null,
          campaign.notes ?? null,
          JSON.stringify(
            campaign.metadata ?? {},
          ),
          campaign.createdAt,
          campaign.updatedAt,
        );

      return campaign;
    }

    this.campaigns.set(
      campaign.id,
      campaign,
    );

    return campaign;
  }

  get(
    id: string,
  ): CampaignRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              channel,
              status,
              audience,
              budget,
              spend,
              leads,
              start_date,
              end_date,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM campaigns
            WHERE id = ?
          `)
          .get(id) as
          | CampaignRow
          | undefined;

      if (!row) {
        throw new Error(
          `Campaign "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const campaign =
      this.campaigns.get(id);

    if (!campaign) {
      throw new Error(
        `Campaign "${id}" was not found.`,
      );
    }

    return campaign;
  }

  list(): CampaignRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              channel,
              status,
              audience,
              budget,
              spend,
              leads,
              start_date,
              end_date,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM campaigns
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          CampaignRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.campaigns.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): CampaignRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              channel,
              status,
              audience,
              budget,
              spend,
              leads,
              start_date,
              end_date,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM campaigns
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          CampaignRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.campaigns.values(),
    ).filter(
      (campaign) =>
        campaign.clientId === clientId,
    );
  }

  update(
    campaign: CampaignRecord,
  ): CampaignRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE campaigns
            SET
              client_id = ?,
              name = ?,
              channel = ?,
              status = ?,
              audience = ?,
              budget = ?,
              spend = ?,
              leads = ?,
              start_date = ?,
              end_date = ?,
              owner = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            campaign.clientId ?? null,
            campaign.name,
            campaign.channel ?? null,
            campaign.status,
            campaign.audience ?? null,
            campaign.budget ?? null,
            campaign.spend ?? null,
            campaign.leads ?? null,
            campaign.startDate ?? null,
            campaign.endDate ?? null,
            campaign.owner ?? null,
            campaign.notes ?? null,
            JSON.stringify(
              campaign.metadata ?? {},
            ),
            campaign.updatedAt,
            campaign.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Campaign "${campaign.id}" was not found.`,
        );
      }

      return campaign;
    }

    if (
      !this.campaigns.has(
        campaign.id,
      )
    ) {
      throw new Error(
        `Campaign "${campaign.id}" was not found.`,
      );
    }

    this.campaigns.set(
      campaign.id,
      campaign,
    );

    return campaign;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM campaigns
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Campaign "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.campaigns.delete(id);

    if (!deleted) {
      throw new Error(
        `Campaign "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a campaign record.
   */
  private mapRow(
    row: CampaignRow,
  ): CampaignRecord {
    return {
      id: row.id,
      clientId:
        row.client_id ?? undefined,
      name: row.name,
      channel:
        row.channel ?? undefined,
      status:
        row.status as CampaignStatus,
      audience:
        row.audience ?? undefined,
      budget:
        row.budget ?? undefined,
      spend:
        row.spend ?? undefined,
      leads:
        row.leads ?? undefined,
      startDate:
        row.start_date ?? undefined,
      endDate:
        row.end_date ?? undefined,
      owner:
        row.owner ?? undefined,
      notes:
        row.notes ?? undefined,
      metadata:
        this.parseMetadata(
          row.metadata_json,
        ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Safely parses campaign metadata stored as JSON.
   */
  private parseMetadata(
    value: string,
  ): Record<string, unknown> {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as
          Record<string, unknown>;
      }
    } catch {
      // Invalid historical metadata is treated as empty.
    }

    return {};
  }
}
