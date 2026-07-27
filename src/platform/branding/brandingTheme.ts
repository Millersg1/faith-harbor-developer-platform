import type { OrganizationBrandingRecord } from "./OrganizationBranding";

/**
 * Shared, pure helpers for rendering a tenant's brand into HTML documents
 * (printable invoices, branded emails). Kept dependency-free and defensive:
 * every tenant-supplied value is HTML-escaped, and sensible fallbacks keep an
 * unbranded tenant looking clean rather than broken.
 */

/** The platform's default brand, used when a tenant hasn't set its own. */
export const DEFAULT_BRAND_NAME =
  "All Elite Cloud";
export const DEFAULT_BRAND_ACCENT =
  "#2dd4bf";

/** Escapes a string for safe interpolation into HTML text or attributes. */
export function escapeHtml(
  value: string | undefined | null,
): string {
  if (value == null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The tenant's display name, or the platform default. */
export function brandName(
  branding?: OrganizationBrandingRecord,
): string {
  const name =
    branding?.displayName?.trim();

  return name || DEFAULT_BRAND_NAME;
}

/**
 * The tenant's primary/accent color as a safe `#rrggbb` string. Falls back to
 * the platform accent if unset or malformed (never trusts raw input in CSS).
 */
export function brandAccent(
  branding?: OrganizationBrandingRecord,
): string {
  const color =
    branding?.primaryColor?.trim() ||
    branding?.accentColor?.trim();

  if (
    color &&
    /^#[0-9a-fA-F]{6}$/.test(color)
  ) {
    return color;
  }

  return DEFAULT_BRAND_ACCENT;
}

/** The tenant's support email, if set and plausible. */
export function brandSupportEmail(
  branding?: OrganizationBrandingRecord,
): string | undefined {
  const email =
    branding?.supportEmail?.trim();

  return email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
    ? email
    : undefined;
}

/**
 * A brand "lockup" for a document header: the logo image when a valid https
 * URL is set, otherwise the tenant name as text. Returns safe HTML.
 */
export function brandLockupHtml(
  branding: OrganizationBrandingRecord | undefined,
  options: { color: string },
): string {
  const logo =
    branding?.logoUrl?.trim();

  if (
    logo &&
    /^https:\/\/[^\s"'<>]+$/.test(logo)
  ) {
    return `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brandName(branding))}" style="max-height:48px;max-width:220px;" />`;
  }

  return `<span style="font-size:22px;font-weight:800;color:${options.color};">${escapeHtml(brandName(branding))}</span>`;
}
