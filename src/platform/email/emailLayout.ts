import type { OrganizationBrandingRecord } from "../branding/OrganizationBranding";
import {
  brandAccent,
  brandName,
  brandSupportEmail,
  escapeHtml,
} from "../branding/brandingTheme";

export interface BrandedEmailInput {
  /** The plain-text body already composed by the caller. */
  body: string;
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
}

/**
 * Wraps a plain-text email body in a simple, robust, table-based HTML layout
 * carrying the tenant's brand (name header in the accent color, a footer with
 * the support email). Table layout + inline styles for broad email-client
 * support; every value is HTML-escaped. The plain text is preserved separately
 * by the caller so non-HTML clients still get a readable message.
 *
 * Only an https logo is shown as an image (avoids broken/mixed-content refs);
 * otherwise the brand name renders as text.
 */
export function renderBrandedEmailHtml(
  branding: OrganizationBrandingRecord | undefined,
  input: BrandedEmailInput,
): string {
  const accent = brandAccent(branding);
  const name = brandName(branding);
  const support =
    brandSupportEmail(branding);
  const logo =
    branding?.logoUrl?.trim();
  const showLogo =
    logo &&
    /^https:\/\/[^\s"'<>]+$/.test(logo);

  const header = showLogo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}" style="max-height:40px;max-width:200px;" />`
    : `<span style="font-size:20px;font-weight:800;color:#ffffff;">${escapeHtml(name)}</span>`;

  // Preserve paragraph breaks from the plain body.
  const bodyHtml = escapeHtml(input.body)
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 16px;line-height:1.6;color:#374151;font-size:15px;">${para.replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  const ctaHtml = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:${accent};">
        <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:12px 22px;color:#04211d;font-weight:700;text-decoration:none;font-size:14px;">${escapeHtml(input.cta.label)}</a>
      </td></tr></table>`
    : "";

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${accent};padding:20px 28px;">${header}</td></tr>
        <tr><td style="padding:28px;">${bodyHtml}${ctaHtml}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #f0f1f3;color:#9ca3af;font-size:12px;">
          ${escapeHtml(name)}${support ? ` &middot; <a href="mailto:${escapeHtml(support)}" style="color:#9ca3af;">${escapeHtml(support)}</a>` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
