import { requireTenant } from "../../tenancy/TenantContext";
import {
  defaultWorkspacePreferences,
  type OrganizationWorkspacePreferences,
  type UpdateWorkspacePreferencesRequest,
} from "./OrganizationWorkspacePreferences";
import { WorkspacePreferencesRepository } from "./WorkspacePreferencesRepository";

/**
 * Reads and writes the acting tenant's shared workspace preferences. Reading a
 * tenant that has never saved preferences returns safe defaults (onboarding
 * shown), so callers always get a value to render.
 */
export class WorkspacePreferencesService {
  constructor(
    private readonly repository = new WorkspacePreferencesRepository(),
  ) {}

  async get(): Promise<OrganizationWorkspacePreferences> {
    const existing = await this.repository.get();

    return (
      existing ?? defaultWorkspacePreferences(requireTenant().organizationId)
    );
  }

  /**
   * Applies a partial update. Only provided fields change; the rest keep their
   * current (or default) values. Stamps `updatedAt`.
   */
  async update(
    changes: UpdateWorkspacePreferencesRequest,
  ): Promise<OrganizationWorkspacePreferences> {
    const current = await this.get();

    return this.repository.upsert({
      onboardingDismissed:
        changes.onboardingDismissed ?? current.onboardingDismissed,
      updatedAt: new Date().toISOString(),
    });
  }
}
