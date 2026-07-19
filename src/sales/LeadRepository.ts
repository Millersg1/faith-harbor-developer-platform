import type {
  DatabaseSync,
} from "node:sqlite";

import type { LeadRecord } from "./LeadRecord";
import type { LeadStatus } from "./LeadStatus";

interface LeadRow {
  id: string;
  client_id: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  campaign_id: string | null;
  service_interest: string | null;
  estimated_value: number | null;
  status: string;
  owner: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores and retrieves sales lead records.
 *
 * Without a database connection, leads are kept in memory.
 * When SQLite is supplied, leads persist across restarts.
 */
export class LeadRepository {
  private readonly leads =
    new Map<string, LeadRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    lead: LeadRecord,
  ): LeadRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO leads (
            id,
            client_id,
            name,
            company,
            email,
            phone,
            source,
            campaign_id,
            service_interest,
            estimated_value,
            status,
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
          lead.id,
          lead.clientId ?? null,
          lead.name,
          lead.company ?? null,
          lead.email ?? null,
          lead.phone ?? null,
          lead.source ?? null,
          lead.campaignId ?? null,
          lead.serviceInterest ?? null,
          lead.estimatedValue ?? null,
          lead.status,
          lead.owner ?? null,
          lead.notes ?? null,
          JSON.stringify(
            lead.metadata ?? {},
          ),
          lead.createdAt,
          lead.updatedAt,
        );

      return lead;
    }

    this.leads.set(
      lead.id,
      lead,
    );

    return lead;
  }

  get(
    id: string,
  ): LeadRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              company,
              email,
              phone,
              source,
              campaign_id,
              service_interest,
              estimated_value,
              status,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM leads
            WHERE id = ?
          `)
          .get(id) as
          | LeadRow
          | undefined;

      if (!row) {
        throw new Error(
          `Lead "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const lead =
      this.leads.get(id);

    if (!lead) {
      throw new Error(
        `Lead "${id}" was not found.`,
      );
    }

    return lead;
  }

  list(): LeadRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              company,
              email,
              phone,
              source,
              campaign_id,
              service_interest,
              estimated_value,
              status,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM leads
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          LeadRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.leads.values(),
    );
  }

  findByClientId(
    clientId: string,
  ): LeadRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              client_id,
              name,
              company,
              email,
              phone,
              source,
              campaign_id,
              service_interest,
              estimated_value,
              status,
              owner,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM leads
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          LeadRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.leads.values(),
    ).filter(
      (lead) =>
        lead.clientId === clientId,
    );
  }

  findByCampaignId(
    campaignId: string,
  ): LeadRecord[] {
    return this.list().filter(
      (lead) =>
        lead.campaignId ===
        campaignId,
    );
  }

  update(
    lead: LeadRecord,
  ): LeadRecord {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            UPDATE leads
            SET
              client_id = ?,
              name = ?,
              company = ?,
              email = ?,
              phone = ?,
              source = ?,
              campaign_id = ?,
              service_interest = ?,
              estimated_value = ?,
              status = ?,
              owner = ?,
              notes = ?,
              metadata_json = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .run(
            lead.clientId ?? null,
            lead.name,
            lead.company ?? null,
            lead.email ?? null,
            lead.phone ?? null,
            lead.source ?? null,
            lead.campaignId ?? null,
            lead.serviceInterest ?? null,
            lead.estimatedValue ?? null,
            lead.status,
            lead.owner ?? null,
            lead.notes ?? null,
            JSON.stringify(
              lead.metadata ?? {},
            ),
            lead.updatedAt,
            lead.id,
          );

      if (result.changes === 0) {
        throw new Error(
          `Lead "${lead.id}" was not found.`,
        );
      }

      return lead;
    }

    if (
      !this.leads.has(lead.id)
    ) {
      throw new Error(
        `Lead "${lead.id}" was not found.`,
      );
    }

    this.leads.set(
      lead.id,
      lead,
    );

    return lead;
  }

  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM leads
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Lead "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.leads.delete(id);

    if (!deleted) {
      throw new Error(
        `Lead "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into a lead record.
   */
  private mapRow(
    row: LeadRow,
  ): LeadRecord {
    return {
      id: row.id,
      clientId:
        row.client_id ?? undefined,
      name: row.name,
      company:
        row.company ?? undefined,
      email:
        row.email ?? undefined,
      phone:
        row.phone ?? undefined,
      source:
        row.source ?? undefined,
      campaignId:
        row.campaign_id ?? undefined,
      serviceInterest:
        row.service_interest ??
        undefined,
      estimatedValue:
        row.estimated_value ??
        undefined,
      status:
        row.status as LeadStatus,
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
   * Safely parses lead metadata stored as JSON.
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
