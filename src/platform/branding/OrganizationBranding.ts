/**
 * A tenant's white-label branding. One record per organization (keyed by
 * the tenant itself). Every field is optional — the application falls back
 * to platform defaults for anything not set — so a brand-new tenant simply
 * has empty branding until its owner fills it in.
 */
export interface OrganizationBrandingRecord {
  organizationId: string;

  /**
   * The name shown in the tenant's UI (may differ from the legal org
   * name).
   */
  displayName?: string;

  logoUrl?: string;

  faviconUrl?: string;

  /**
   * Brand colors as `#rrggbb` hex.
   */
  primaryColor?: string;

  secondaryColor?: string;

  accentColor?: string;

  /**
   * A welcome line shown on the tenant's login screen.
   */
  loginMessage?: string;

  supportEmail?: string;

  updatedAt: string;
}

export interface UpdateBrandingRequest {
  displayName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  loginMessage?: string;
  supportEmail?: string;
}

const HEX_COLOR =
  /^#[0-9a-fA-F]{6}$/;

/**
 * Validates and normalizes a branding update. Colors must be `#rrggbb`;
 * a support email must look like an email. Empty strings clear a field.
 * Returns the cleaned partial to merge onto the existing record.
 */
export function normalizeBranding(
  changes: UpdateBrandingRequest,
): Partial<OrganizationBrandingRecord> {
  const cleaned: Partial<OrganizationBrandingRecord> =
    {};

  const text = (
    value: string | undefined,
  ): string | undefined => {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed || undefined;
  };

  const color = (
    value: string | undefined,
    field: string,
  ): string | undefined => {
    const trimmed = text(value);

    if (
      trimmed &&
      !HEX_COLOR.test(trimmed)
    ) {
      throw new Error(
        `${field} must be a hex color like #1a2b3c.`,
      );
    }

    return trimmed;
  };

  if ("displayName" in changes) {
    cleaned.displayName = text(
      changes.displayName,
    );
  }

  if ("logoUrl" in changes) {
    cleaned.logoUrl = text(
      changes.logoUrl,
    );
  }

  if ("faviconUrl" in changes) {
    cleaned.faviconUrl = text(
      changes.faviconUrl,
    );
  }

  if ("primaryColor" in changes) {
    cleaned.primaryColor = color(
      changes.primaryColor,
      "primaryColor",
    );
  }

  if ("secondaryColor" in changes) {
    cleaned.secondaryColor = color(
      changes.secondaryColor,
      "secondaryColor",
    );
  }

  if ("accentColor" in changes) {
    cleaned.accentColor = color(
      changes.accentColor,
      "accentColor",
    );
  }

  if ("loginMessage" in changes) {
    cleaned.loginMessage = text(
      changes.loginMessage,
    );
  }

  if ("supportEmail" in changes) {
    const email = text(
      changes.supportEmail,
    );

    if (
      email &&
      !email.includes("@")
    ) {
      throw new Error(
        "supportEmail must be a valid email.",
      );
    }

    cleaned.supportEmail = email;
  }

  return cleaned;
}
