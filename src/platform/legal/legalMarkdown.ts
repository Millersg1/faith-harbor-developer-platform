/**
 * A tiny, safe Markdown-subset renderer for legal documents.
 *
 * The platform deliberately ships no Markdown library and no HTML sanitizer
 * (see the web layer, which renders API data via textContent, never
 * innerHTML). Legal documents are authored as Markdown by the platform owner
 * or a tenant admin, so we must render them without ever trusting raw HTML.
 *
 * The safety model is "escape first, format second":
 *   1. Every character of the source is HTML-escaped up front, so any `<`,
 *      `>`, `"`, `&`, or `<script>` in the input becomes inert text.
 *   2. Only a fixed, well-known set of block/inline patterns is then turned
 *      into markup, operating on the already-escaped text.
 *   3. Links accept only an explicit scheme allow-list (http, https, mailto)
 *      plus in-site relative (`/…`) and anchor (`#…`) targets. Anything else
 *      (e.g. `javascript:`) renders as plain text — never as an href.
 *
 * Because we never pass source HTML through, there is no path by which a
 * document body can inject a tag, an event handler, or a script. This is the
 * only renderer used for legal-document bodies, platform and tenant alike.
 */

/** HTML-escape text so it can never introduce markup. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Turn a heading's text into a stable, URL-safe anchor id (for the
 * table of contents and deep links). Operates on already-escaped text.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, " ") // collapse HTML entities to a space
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** A heading discovered while rendering, used to build a table of contents. */
export interface LegalHeading {
  level: number;
  text: string;
  id: string;
}

export interface RenderedLegal {
  html: string;
  headings: LegalHeading[];
}

const ALLOWED_LINK = /^(https?:\/\/|mailto:|\/|#)/i;

/**
 * Apply inline formatting to a single line of ALREADY-ESCAPED text:
 * `**bold**`, `*italic*`, `` `code` ``, and `[label](target)` links.
 */
function renderInline(escaped: string): string {
  let out = escaped;

  // Inline code first, so `*` inside code is not treated as emphasis. The
  // content is already escaped, so this only wraps it.
  out = out.replace(
    /`([^`]+)`/g,
    (_m, code: string) => `<code>${code}</code>`,
  );

  // Links: [label](target). Both label and target come from escaped text.
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, target: string) => {
      if (!ALLOWED_LINK.test(target)) {
        // Unsupported/unsafe scheme — keep the visible text, drop the link.
        return `${label} (${target})`;
      }
      const external = /^https?:/i.test(target);
      const rel = external
        ? ' rel="noopener noreferrer"'
        : "";
      return `<a href="${target}"${rel}>${label}</a>`;
    },
  );

  // Bold then italic (bold uses the greedier delimiter first).
  out = out.replace(
    /\*\*([^*]+)\*\*/g,
    (_m, t: string) => `<strong>${t}</strong>`,
  );
  out = out.replace(
    /(^|[^*])\*([^*]+)\*(?!\*)/g,
    (_m, pre: string, t: string) => `${pre}<em>${t}</em>`,
  );

  return out;
}

/**
 * Render a Markdown-subset document to safe HTML. Supported blocks:
 * `#`..`######` headings, `-`/`*` bullet lists, `1.` numbered lists,
 * `>` blockquotes, `---` horizontal rules, and paragraphs. Everything is
 * HTML-escaped before any formatting is applied.
 */
export function renderLegalMarkdown(source: string): RenderedLegal {
  const headings: LegalHeading[] = [];
  const usedIds = new Set<string>();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];

  let i = 0;
  const flushList = (ordered: boolean, items: string[]) => {
    if (items.length === 0) {
      return;
    }
    const tag = ordered ? "ol" : "ul";
    out.push(`<${tag}>`);
    for (const item of items) {
      out.push(`<li>${renderInline(escapeHtml(item))}</li>`);
    }
    out.push(`</${tag}>`);
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Blank line — skip.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const escaped = renderInline(escapeHtml(heading[2].trim()));
      let id = slugifyHeading(escapeHtml(heading[2].trim()));
      if (id === "") {
        id = `section-${headings.length + 1}`;
      }
      let unique = id;
      let n = 2;
      while (usedIds.has(unique)) {
        unique = `${id}-${n}`;
        n += 1;
      }
      usedIds.add(unique);
      headings.push({ level, text: heading[2].trim(), id: unique });
      out.push(`<h${level} id="${unique}">${escaped}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote (single or consecutive lines).
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(
        `<blockquote>${renderInline(
          escapeHtml(quote.join(" ")),
        )}</blockquote>`,
      );
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      flushList(false, items);
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      flushList(true, items);
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-block lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${renderInline(escapeHtml(para.join(" ")))}</p>`);
  }

  return { html: out.join("\n"), headings };
}
