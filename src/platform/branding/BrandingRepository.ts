import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { OrganizationBrandingRecord } from "./OrganizationBranding";

interface BrandingRow {
  organization_id: string;
  display_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  login_message: string | null;
  support_email: string | null;
  updated_at: string;
}

/**
 * Stores one branding record per tenant, keyed by the organization (which
 * is the tenant). Reads and writes are scoped to the current tenant, so a
 * tenant can only ever see or change its own branding.
 */
export class BrandingRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      OrganizationBrandingRecord
    >();

  async get(): Promise<
    OrganizationBrandingRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organization_branding WHERE organization_id = $1",
          [organizationId],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    return this.memory.get(
      organizationId,
    );
  }

  /**
   * Inserts or replaces the current tenant's branding. The organization
   * id is taken from the tenant context, not the record.
   */
  async upsert(
    branding: Omit<
      OrganizationBrandingRecord,
      "organizationId"
    >,
  ): Promise<OrganizationBrandingRecord> {
    const organizationId =
      this.tenantId();

    const record: OrganizationBrandingRecord =
      { ...branding, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO organization_branding
           (organization_id, display_name, logo_url, favicon_url,
            primary_color, secondary_color, accent_color,
            login_message, support_email, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (organization_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           logo_url = EXCLUDED.logo_url,
           favicon_url = EXCLUDED.favicon_url,
           primary_color = EXCLUDED.primary_color,
           secondary_color = EXCLUDED.secondary_color,
           accent_color = EXCLUDED.accent_color,
           login_message = EXCLUDED.login_message,
           support_email = EXCLUDED.support_email,
           updated_at = EXCLUDED.updated_at`,
        [
          record.organizationId,
          record.displayName ?? null,
          record.logoUrl ?? null,
          record.faviconUrl ?? null,
          record.primaryColor ?? null,
          record.secondaryColor ??
            null,
          record.accentColor ?? null,
          record.loginMessage ?? null,
          record.supportEmail ?? null,
          record.updatedAt,
        ],
      );

      return record;
    }

    this.memory.set(
      organizationId,
      record,
    );

    return record;
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): BrandingRow | undefined {
  return row as BrandingRow | undefined;
}

function mapRow(
  row: BrandingRow,
): OrganizationBrandingRecord {
  const record: OrganizationBrandingRecord =
    {
      organizationId:
        row.organization_id,
      updatedAt: row.updated_at,
    };

  if (row.display_name) {
    record.displayName =
      row.display_name;
  }

  if (row.logo_url) {
    record.logoUrl = row.logo_url;
  }

  if (row.favicon_url) {
    record.faviconUrl =
      row.favicon_url;
  }

  if (row.primary_color) {
    record.primaryColor =
      row.primary_color;
  }

  if (row.secondary_color) {
    record.secondaryColor =
      row.secondary_color;
  }

  if (row.accent_color) {
    record.accentColor =
      row.accent_color;
  }

  if (row.login_message) {
    record.loginMessage =
      row.login_message;
  }

  if (row.support_email) {
    record.supportEmail =
      row.support_email;
  }

  return record;
}
