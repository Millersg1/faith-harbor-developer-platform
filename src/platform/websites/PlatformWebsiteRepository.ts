import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  PlatformWebsiteRecord,
  PlatformWebsiteStatus,
} from "./PlatformWebsite";

interface WebsiteRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  brief: string | null;
  accent_color: string | null;
  html: string | null;
  status: string;
  domain: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores websites, always scoped to the current tenant. Same isolation
 * contract as every tenant-scoped repository: resolve the organization from
 * context (fail closed) and constrain every query to it.
 */
export class PlatformWebsiteRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformWebsiteRecord
    >();

  async create(
    website: Omit<
      PlatformWebsiteRecord,
      "organizationId"
    >,
  ): Promise<PlatformWebsiteRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformWebsiteRecord =
      { ...website, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO websites
           (id, organization_id, client_id, name, brief, accent_color,
            html, status, domain, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.name,
          record.brief ?? null,
          record.accentColor ?? null,
          record.html ?? null,
          record.status,
          record.domain ?? null,
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
    PlatformWebsiteRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM websites WHERE id = $1 AND organization_id = $2",
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
    PlatformWebsiteRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM websites
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is WebsiteRow =>
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
    website: PlatformWebsiteRecord,
  ): Promise<PlatformWebsiteRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE websites
            SET client_id = $3, name = $4, brief = $5, accent_color = $6,
                html = $7, status = $8, domain = $9, updated_at = $10
          WHERE id = $1 AND organization_id = $2`,
        [
          website.id,
          organizationId,
          website.clientId ?? null,
          website.name,
          website.brief ?? null,
          website.accentColor ?? null,
          website.html ?? null,
          website.status,
          website.domain ?? null,
          website.updatedAt,
        ],
      );

      return website;
    }

    const existing = this.memory.get(
      website.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        website.id,
        website,
      );
    }

    return website;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM websites WHERE id = $1 AND organization_id = $2",
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
): WebsiteRow | undefined {
  return row as WebsiteRow | undefined;
}

function mapRow(
  row: WebsiteRow,
): PlatformWebsiteRecord {
  const record: PlatformWebsiteRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      status:
        row.status as PlatformWebsiteStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id) {
    record.clientId = row.client_id;
  }

  if (row.brief) {
    record.brief = row.brief;
  }

  if (row.accent_color) {
    record.accentColor =
      row.accent_color;
  }

  if (row.html) {
    record.html = row.html;
  }

  if (row.domain) {
    record.domain = row.domain;
  }

  return record;
}
