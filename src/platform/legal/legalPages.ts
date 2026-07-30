import {
  escapeHtml,
  renderLegalMarkdown,
} from "./legalMarkdown";
import {
  LEGAL_KIND_META,
  legalKindsInOrder,
  type PlatformLegalDocumentRecord,
} from "./PlatformLegalDocument";

/**
 * Server-rendered public pages for All Elite Cloud's legal documents.
 *
 * These are self-contained, accessible, print-friendly HTML documents (their
 * own styles inline, theme-aware, WCAG-oriented landmarks and headings). They
 * intentionally do NOT reuse the app dashboard layout — a legal page is a
 * readable document, not the workspace UI.
 *
 * Only PUBLISHED documents are ever rendered with their body. An unpublished
 * kind renders an honest "being finalized" notice — never a draft, never a
 * fabricated policy, and never a 404.
 */

const HEAD_ICONS = `
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;

const STYLES = `
  :root {
    --bg: #f7f8fb; --card: #ffffff; --ink: #14181f; --muted: #5b6472;
    --line: #e4e7ee; --accent: #0f766e; --accent-ink: #ffffff;
    --mark: url("/favicon-192.png");
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1220; --card: #121a2b; --ink: #eef2f9;
      --muted: #9aa6b8; --line: #223049; --accent: #2dd4bf; --accent-ink: #08221f;
    }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
  }
  a { color: var(--accent); }
  a:focus-visible, button:focus-visible {
    outline: 3px solid var(--accent); outline-offset: 2px;
  }
  .wrap { max-width: 820px; margin: 0 auto; padding: 24px 20px 64px; }
  .brand {
    display: flex; align-items: center; gap: 10px; font-weight: 800;
    letter-spacing: -0.02em; text-decoration: none; color: var(--ink);
  }
  .brand .mark {
    width: 28px; height: 28px; border-radius: 8px; flex: none;
    background: center / cover no-repeat var(--mark);
  }
  header.top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding: 14px 20px; border-bottom: 1px solid var(--line);
    background: var(--card);
  }
  .doc {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 32px; margin-top: 24px;
  }
  .doc h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 6px; text-wrap: balance; }
  .meta { color: var(--muted); font-size: .9rem; margin: 0 0 4px; }
  .meta .dot { margin: 0 8px; opacity: .5; }
  .intro {
    margin: 18px 0 8px; padding: 14px 16px; border-left: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 6px;
  }
  .toc {
    margin: 18px 0; padding: 14px 16px; border: 1px solid var(--line);
    border-radius: 10px; background: var(--bg);
  }
  .toc p { margin: 0 0 6px; font-weight: 700; font-size: .82rem;
    text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .toc ul { margin: 0; padding-left: 18px; }
  .body h2 { font-size: 1.3rem; margin: 28px 0 8px; }
  .body h3 { font-size: 1.08rem; margin: 22px 0 6px; }
  .body p { margin: 0 0 14px; }
  .body ul, .body ol { margin: 0 0 14px; padding-left: 24px; }
  .body li { margin: 4px 0; }
  .body blockquote {
    margin: 0 0 14px; padding: 10px 14px; border-left: 3px solid var(--line);
    color: var(--muted); background: var(--bg); border-radius: 6px;
  }
  .body code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em;
    background: var(--bg); padding: 1px 5px; border-radius: 5px;
  }
  .body hr { border: none; border-top: 1px solid var(--line); margin: 24px 0; }
  .actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
  .btn {
    appearance: none; border: 1px solid var(--line); background: var(--card);
    color: var(--ink); border-radius: 9px; padding: 8px 14px; font: inherit;
    font-weight: 600; cursor: pointer; text-decoration: none;
  }
  .btn.print { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
  .notice {
    margin-top: 24px; padding: 22px; border: 1px dashed var(--line);
    border-radius: 12px; background: var(--card);
  }
  footer.legal {
    max-width: 820px; margin: 40px auto 0; padding: 24px 20px;
    border-top: 1px solid var(--line); color: var(--muted); font-size: .9rem;
  }
  footer.legal nav { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 10px; }
  .prior { margin-top: 18px; font-size: .9rem; color: var(--muted); }
  @media print {
    header.top .actions, .actions, footer.legal nav a[href="/"] { display: none; }
    body { background: #fff; color: #000; }
    .doc, .toc, header.top { border: none; background: #fff; }
    .wrap { max-width: none; padding: 0; }
    a { color: #000; text-decoration: underline; }
  }
`;

function shell(title: string, main: string): string {
  const links = legalKindsInOrder()
    .map(
      (m) =>
        `<a href="/legal/${m.slug}">${escapeHtml(m.title)}</a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b1220" />
  <title>${escapeHtml(title)} · All Elite Cloud</title>${HEAD_ICONS}
  <style>${STYLES}</style>
</head>
<body>
  <header class="top">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"></span> All Elite Cloud</a>
    <a class="btn" href="/legal">All policies</a>
  </header>
  <main class="wrap" id="main">
${main}
  </main>
  <footer class="legal">
    <nav aria-label="Legal documents">${links}</nav>
    <div>Questions? <a href="mailto:legal@allelitecloud.com">legal@allelitecloud.com</a> · <a href="/">Back to All Elite Cloud</a></div>
  </footer>
</body>
</html>`;
}

/** The /legal index listing every policy and whether it is published. */
export function legalIndexPage(
  published: Set<string>,
): string {
  const items = legalKindsInOrder()
    .map((m) => {
      const live = published.has(m.kind);
      const status = live
        ? ""
        : ' <span class="meta">(being finalized)</span>';
      return `<li><a href="/legal/${m.slug}">${escapeHtml(
        m.title,
      )}</a>${status}</li>`;
    })
    .join("");
  const main = `
    <div class="doc">
      <h1>Legal &amp; Policies</h1>
      <p class="intro">All Elite Cloud's platform legal documents. Each policy shows its version and effective date; any policy not yet published is marked.</p>
      <ul class="body">${items}</ul>
    </div>`;
  return shell("Legal", main);
}

/** A published legal document page (printable, with metadata + TOC). */
export function legalDocumentPage(
  doc: PlatformLegalDocumentRecord,
  priorVersions: PlatformLegalDocumentRecord[] = [],
): string {
  const rendered = renderLegalMarkdown(doc.bodyMarkdown);
  const toc = rendered.headings
    .filter((h) => h.level <= 2)
    .map(
      (h) =>
        `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
    )
    .join("");
  const tocBlock =
    toc.length > 0
      ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc}</ul></nav>`
      : "";
  const effective = doc.effectiveDate
    ? escapeHtml(doc.effectiveDate)
    : "—";
  const updated = escapeHtml(doc.updatedAt.slice(0, 10));
  const priorNote =
    priorVersions.length > 0
      ? `<p class="prior">Previous versions: ${priorVersions
          .map(
            (p) =>
              `v${p.version} (effective ${escapeHtml(
                p.effectiveDate ?? p.updatedAt.slice(0, 10),
              )})`,
          )
          .join(", ")}. Contact <a href="mailto:legal@allelitecloud.com">legal@allelitecloud.com</a> for a prior version.</p>`
      : "";

  const main = `
    <article class="doc">
      <h1>${escapeHtml(doc.title)}</h1>
      <p class="meta">Version ${doc.version}<span class="dot">·</span>Effective ${effective}<span class="dot">·</span>Last updated ${updated}</p>
      <p class="intro">${escapeHtml(doc.summary)}</p>
      ${tocBlock}
      <div class="body">
${rendered.html}
      </div>
      <div class="actions">
        <button class="btn print" type="button" onclick="window.print()">Print / Save as PDF</button>
        <a class="btn" href="/legal">All policies</a>
      </div>
      ${priorNote}
    </article>`;
  return shell(doc.title, main);
}

/** Honest placeholder for a policy that exists but is not yet published. */
export function legalNotPublishedPage(kind: string): string {
  const meta = LEGAL_KIND_META[kind as keyof typeof LEGAL_KIND_META];
  const title = meta ? meta.title : "Policy";
  const main = `
    <div class="doc">
      <h1>${escapeHtml(title)}</h1>
      <div class="notice">
        <p>This policy is being finalized and is not yet published.</p>
        <p>If you need this information now, contact <a href="mailto:legal@allelitecloud.com">legal@allelitecloud.com</a>.</p>
        <p><a href="/legal">See published policies</a></p>
      </div>
    </div>`;
  return shell(title, main);
}
