import type { ResolvedSender } from "./MarketingSenderService";

export interface MarketingContentInput {
  sender: ResolvedSender;
  /** Tenant-authored subject. */
  subject: string;
  /** Tenant-authored plain-text body (always present). */
  text: string;
  /** Optional tenant-authored HTML body (sanitized here). */
  html?: string;
  /**
   * Browser-facing unsubscribe link (hardened fragment-exchange), e.g.
   * `https://host/unsubscribe#u=<token>`. Goes in the BODY only.
   */
  unsubscribeUrl: string;
  /**
   * RFC 8058 one-click endpoint (POST), e.g.
   * `https://host/api/unsubscribe/one-click/<token>`. Goes in the HEADER only —
   * never the browser fragment link.
   */
  oneClickUrl: string;
}

export interface MarketingContent {
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

const MAX_SUBJECT = 200;

/** Strip CR/LF/other control characters from a header field. */
function headerSafe(value: string): string {
  return Array.from(value)
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join("")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Conservative HTML sanitization for tenant-authored marketing HTML: removes
 * script/style blocks, inline event handlers, and javascript: URLs. (A full
 * DOM sanitizer would be stronger; this is the safe floor with no new deps.)
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '$1="#"');
}

/** Quote a display name safely for a From header. */
function quotedName(name: string): string {
  const safe = headerSafe(name).replace(/["\\]/g, "");
  return `"${safe}"`;
}

/**
 * Build a CAN-SPAM-compliant marketing message: accurate sender identity, valid
 * reply-to, physical mailing address, a VISIBLE unsubscribe link in BOTH safe
 * HTML and plain text, and the List-Unsubscribe / one-click headers. All header
 * fields are CR/LF-safe; tenant HTML is sanitized. URLs are supplied by the
 * caller from trusted host resolution (never raw Host/X-Forwarded-Host).
 */
export function buildMarketingEmail(
  input: MarketingContentInput,
): MarketingContent {
  const { sender } = input;
  const from = `${quotedName(sender.fromName)} <${headerSafe(sender.fromAddress)}>`;
  const replyTo = headerSafe(sender.replyTo);
  const subject = headerSafe(input.subject).slice(0, MAX_SUBJECT);
  const physical = headerSafe(sender.physicalAddress);
  const unsub = headerSafe(input.unsubscribeUrl);
  const oneClick = headerSafe(input.oneClickUrl);

  // Plain text: body + visible unsubscribe URL + physical mailing address.
  const text =
    `${input.text}\n\n` +
    `— — —\n` +
    `Unsubscribe: ${unsub}\n` +
    `${physical}`;

  // HTML: sanitized body + a visible unsubscribe link + physical address footer.
  const bodyHtml = input.html
    ? sanitizeHtml(input.html)
    : `<p>${escapeHtml(input.text).replace(/\n/g, "<br>")}</p>`;
  const html =
    `${bodyHtml}` +
    `<hr>` +
    `<p style="font-size:12px;color:#666">` +
    `<a href="${escapeHtml(unsub)}">Unsubscribe</a><br>` +
    `${escapeHtml(physical)}` +
    `</p>`;

  const headers: Record<string, string> = {
    // Header uses the one-click ENDPOINT (not the browser fragment link).
    "List-Unsubscribe": `<${oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  return { from, replyTo, subject, text, html, headers };
}
