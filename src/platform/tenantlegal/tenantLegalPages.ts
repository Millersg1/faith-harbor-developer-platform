import {
  escapeHtml,
  renderLegalMarkdown,
} from "../legal/legalMarkdown";
import type { TenantLegalDocumentRecord } from "./TenantLegalDocument";

/**
 * Public, branded rendering of a tenant's own published legal document.
 * Server-rendered, self-contained, accessible, print-friendly. Uses the shared
 * escape-first safe renderer, so tenant content can never inject scripts, event
 * handlers, unsafe URLs, or raw HTML. Only PUBLISHED documents ever reach here;
 * the route resolves the tenant from the host and never crosses tenants.
 */

export interface TenantBrand {
  businessName: string;
  primaryColor?: string | null;
}

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function accent(color: string | null | undefined): string {
  return color && SAFE_COLOR.test(color) ? color : "#0f766e";
}

export function tenantLegalPage(
  brand: TenantBrand,
  doc: TenantLegalDocumentRecord,
): string {
  const rendered = renderLegalMarkdown(doc.bodyMarkdown);
  const toc = rendered.headings
    .filter((h) => h.level <= 2)
    .map(
      (h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
    )
    .join("");
  const tocBlock =
    toc.length > 0
      ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc}</ul></nav>`
      : "";
  const a = accent(brand.primaryColor);
  const effective = doc.effectiveDate
    ? escapeHtml(doc.effectiveDate)
    : "—";
  const updated = escapeHtml(doc.updatedAt.slice(0, 10));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(doc.title)} · ${escapeHtml(brand.businessName)}</title>
  <style>
    :root { --ink:#14181f; --muted:#5b6472; --line:#e4e7ee; --bg:#f7f8fb; --card:#fff; --accent:${a}; }
    @media (prefers-color-scheme: dark) {
      :root { --ink:#eef2f9; --muted:#9aa6b8; --line:#223049; --bg:#0b1220; --card:#121a2b; }
    }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink);
      font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
    a { color: var(--accent); }
    a:focus-visible, button:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
    .wrap { max-width:820px; margin:0 auto; padding:24px 20px 64px; }
    header.top { border-bottom:1px solid var(--line); padding:14px 0; margin-bottom:8px; font-weight:800; }
    .doc { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:32px; margin-top:16px; }
    h1 { font-size:1.9rem; line-height:1.2; margin:0 0 6px; text-wrap:balance; }
    .meta { color:var(--muted); font-size:.9rem; margin:0 0 4px; }
    .meta .dot { margin:0 8px; opacity:.5; }
    .toc { margin:18px 0; padding:14px 16px; border:1px solid var(--line); border-radius:10px; background:var(--bg); }
    .toc p { margin:0 0 6px; font-weight:700; font-size:.82rem; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
    .toc ul { margin:0; padding-left:18px; }
    .body h2 { font-size:1.3rem; margin:28px 0 8px; }
    .body h3 { font-size:1.08rem; margin:22px 0 6px; }
    .body p { margin:0 0 14px; } .body ul,.body ol { margin:0 0 14px; padding-left:24px; }
    .body li { margin:4px 0; }
    .body blockquote { margin:0 0 14px; padding:10px 14px; border-left:3px solid var(--line); color:var(--muted); background:var(--bg); border-radius:6px; }
    .body code { font-family:ui-monospace,Menlo,monospace; font-size:.92em; background:var(--bg); padding:1px 5px; border-radius:5px; }
    .actions { margin-top:20px; }
    .btn { appearance:none; border:1px solid var(--line); background:var(--accent); color:#fff; border-radius:9px; padding:8px 14px; font:inherit; font-weight:600; cursor:pointer; }
    footer { max-width:820px; margin:24px auto 0; padding:16px 20px; color:var(--muted); font-size:.85rem; border-top:1px solid var(--line); }
    @media print { .actions { display:none; } body { background:#fff; color:#000; } .doc { border:none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">${escapeHtml(brand.businessName)}</header>
    <main id="main">
      <article class="doc">
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="meta">${escapeHtml(brand.businessName)}<span class="dot">·</span>Version ${doc.version}<span class="dot">·</span>Effective ${effective}<span class="dot">·</span>Last updated ${updated}</p>
        ${tocBlock}
        <div class="body">
${rendered.html}
        </div>
        <div class="actions">
          <button class="btn" type="button" onclick="window.print()">Print / Save as PDF</button>
        </div>
      </article>
    </main>
  </div>
  <footer>${escapeHtml(brand.businessName)} — ${escapeHtml(doc.title)} · Version ${doc.version}</footer>
</body>
</html>`;
}
