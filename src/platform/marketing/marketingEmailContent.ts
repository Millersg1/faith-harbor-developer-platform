import type { ResolvedSender } from "./MarketingSenderService";

export interface MarketingContentInput {
  sender: ResolvedSender;
  /** Tenant-authored subject (plain text; header-safe here). */
  subject: string;
  /**
   * Tenant-authored body — PLAIN TEXT (with an optional tiny Markdown-like
   * subset: blank-line paragraphs, single-newline breaks, `# ` headings,
   * `**bold**`, `*italic*`/`_italic_`, and `[label](http/https url)` links).
   * This is the ONLY source of body content. We never accept or parse tenant
   * HTML — the HTML alternative is GENERATED from this text by escaping every
   * character first and then applying the fixed subset, so nothing tenant-
   * authored can become executable markup.
   */
  text: string;
  /** Browser fragment-exchange unsubscribe link — BODY only. */
  unsubscribeUrl: string;
  /** RFC 8058 one-click endpoint — HEADER only (never the fragment link). */
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

/** Escape EVERY HTML-significant character. Applied before any formatting. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Drop control/NUL characters from body text before rendering. */
function stripControl(s: string): string {
  return Array.from(s)
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n === 9 || n === 10 || (n >= 32 && n !== 127);
    })
    .join("");
}

/**
 * Validate a link URL STRUCTURALLY and allow only http/https. Returns an
 * escaped href, or null to reject. Operates on the already-escaped text, so
 * `javascript:`/`data:`/`blob:`/`file:` and any control/space are rejected.
 */
function safeHref(escapedUrl: string): string | null {
  const raw = escapedUrl.replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  if (/[\s<>"'\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return escapeHtml(u.href);
  } catch {
    return null;
  }
}

/** Apply the inline subset to ALREADY-ESCAPED text (links, bold, italic). */
function inline(escaped: string): string {
  let out = escaped.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (whole, label: string, url: string) => {
      const href = safeHref(url);
      // label is already escaped; a bad URL renders as inert literal text.
      return href ? `<a href="${href}">${label}</a>` : whole;
    },
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  return out;
}

/** Render body text to SAFE html (escape-first, then the fixed subset). */
function renderBodyHtml(text: string): string {
  const clean = stripControl(text).replace(/\r\n/g, "\n");
  const blocks = clean.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading && !trimmed.includes("\n")) {
        const level = heading[1].length;
        return `<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`;
      }
      const lines = trimmed
        .split("\n")
        .map((l) => inline(escapeHtml(l)))
        .join("<br>");
      return `<p>${lines}</p>`;
    })
    .join("");
}

/** Quote a display name safely for a From header (keeps legitimate Unicode). */
function quotedName(name: string): string {
  const safe = headerSafe(name).replace(/["\\]/g, "");
  return `"${safe}"`;
}

/**
 * Build a CAN-SPAM-compliant marketing message. Tenant content is plain text;
 * the HTML alternative is generated safely (escape-then-subset — never a
 * sanitizer over tenant HTML). Every interpolated value (business name, physical
 * address, link labels, footer) is escaped. Includes a VISIBLE unsubscribe link
 * in BOTH formats, the physical mailing address, and the List-Unsubscribe /
 * one-click headers. Header fields are CR/LF-safe; URLs come from trusted host
 * resolution.
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
  const unsubHref = safeHref(escapeHtml(unsub));

  const text =
    `${stripControl(input.text)}\n\n` +
    `— — —\n` +
    `Unsubscribe: ${unsub}\n` +
    `${physical}`;

  const html =
    `${renderBodyHtml(input.text)}` +
    `<hr>` +
    `<p style="font-size:12px;color:#666">` +
    (unsubHref
      ? `<a href="${unsubHref}">Unsubscribe</a><br>`
      : `Unsubscribe: ${escapeHtml(unsub)}<br>`) +
    `${escapeHtml(physical)}` +
    `</p>`;

  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  return { from, replyTo, subject, text, html, headers };
}
