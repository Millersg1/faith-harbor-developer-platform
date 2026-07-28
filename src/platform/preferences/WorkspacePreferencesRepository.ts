import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { OrganizationWorkspacePreferences } from "./OrganizationWorkspacePreferences";

interface PreferencesRow {
  organization_id: string;
  onboarding_dismissed: boolean;
  updated_at: string;
}

/**
 * Stores one workspace-preferences row per tenant, keyed by the organization.
 * Every read and write is scoped to the current tenant (fail-closed via
 * {@link TenantScopedRepository.tenantId}), so a tenant can only see or change
 * its own preferences.
 */
export class WorkspacePreferencesRepository extends TenantScopedRepository {
  private readonly memory = new Map<string, OrganizationWorkspacePreferences>();

  async get(): Promise<OrganizationWorkspacePreferences | undefined> {
    const organizationId = this.tenantId();

    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM organization_workspace_preferences WHERE organization_id = $1",
        [organizationId],
      );

      const row = result.rows[0] as
        | Record<string, unknown>
        | undefined;

      return row
        ? mapRow(row as unknown as PreferencesRow)
        : undefined;
    }

    return this.memory.get(organizationId);
  }

  /**
   * Inserts or replaces the current tenant's preferences. The organization id
   * comes from the tenant context, never the caller.
   */
  async upsert(
    preferences: Omit<OrganizationWorkspacePreferences, "organizationId">,
  ): Promise<OrganizationWorkspacePreferences> {
    const organizationId = this.tenantId();

    const record: OrganizationWorkspacePreferences = {
      ...preferences,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO organization_workspace_preferences
           (organization_id, onboarding_dismissed, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id) DO UPDATE SET
           onboarding_dismissed = EXCLUDED.onboarding_dismissed,
           updated_at = EXCLUDED.updated_at`,
        [record.organizationId, record.onboardingDismissed, record.updatedAt],
      );

      return record;
    }

    this.memory.set(organizationId, record);

    return record;
  }
}

function mapRow(row: PreferencesRow): OrganizationWorkspacePreferences {
  return {
    organizationId: row.organization_id,
    onboardingDismissed: Boolean(row.onboarding_dismissed),
    updatedAt: row.updated_at,
  };
}
