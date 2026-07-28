/**
 * Shared, per-organization dashboard/workspace preferences. One row per tenant
 * (the organization is the tenant). These are settings that affect the whole
 * workspace — not a single user — so changing them is an owner/admin action.
 */
export interface OrganizationWorkspacePreferences {
  organizationId: string;
  /** When true, the onboarding Success Center is collapsed for the workspace. */
  onboardingDismissed: boolean;
  updatedAt: string;
}

/** A partial update; only the provided fields change. */
export interface UpdateWorkspacePreferencesRequest {
  onboardingDismissed?: boolean;
}

/**
 * The safe default returned when a tenant has never saved preferences —
 * onboarding is shown (not dismissed) for a fresh workspace.
 */
export function defaultWorkspacePreferences(
  organizationId: string,
): OrganizationWorkspacePreferences {
  return {
    organizationId,
    onboardingDismissed: false,
    updatedAt: "",
  };
}
