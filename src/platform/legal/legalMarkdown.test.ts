import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  renderLegalMarkdown,
} from "./legalMarkdown";

describe("legalMarkdown — safety", () => {
  it("escapes all HTML metacharacters", () => {
    expect(escapeHtml(`<script>&"'`)).toBe(
      "&lt;script&gt;&amp;&quot;&#39;",
    );
  });

  it("never emits a raw <script> tag from the body", () => {
    const { html } = renderLegalMarkdown(
      "Hello\n\n<script>alert(1)</script>\n\nWorld",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralizes an embedded event handler / img onerror", () => {
    const { html } = renderLegalMarkdown(
      `<img src=x onerror="alert(1)">`,
    );
    // The whole tag is escaped to inert text — no real element or attribute.
    expect(html).not.toContain("<img");
    expect(html).not.toContain(`onerror="alert(1)"`);
    expect(html).toContain("&lt;img");
    expect(html).toContain("onerror=&quot;alert(1)&quot;");
  });

  it("drops javascript: links but keeps the visible text", () => {
    const { html } = renderLegalMarkdown(
      "[click](javascript:alert(1))",
    );
    expect(html).not.toContain("href=");
    expect(html).toContain("click");
  });

  it("allows http/https/mailto and in-site links", () => {
    const ext = renderLegalMarkdown(
      "[site](https://example.com)",
    ).html;
    expect(ext).toContain(
      '<a href="https://example.com" rel="noopener noreferrer">site</a>',
    );
    const rel = renderLegalMarkdown(
      "[terms](/legal/terms)",
    ).html;
    expect(rel).toContain('<a href="/legal/terms">terms</a>');
    const mail = renderLegalMarkdown(
      "[mail](mailto:legal@allelitecloud.com)",
    ).html;
    expect(mail).toContain(
      '<a href="mailto:legal@allelitecloud.com">mail</a>',
    );
  });
});

describe("legalMarkdown — formatting", () => {
  it("renders headings with stable ids and collects them", () => {
    const { html, headings } = renderLegalMarkdown(
      "## First Section\n\nText\n\n### Sub",
    );
    expect(html).toContain('<h2 id="first-section">First Section</h2>');
    expect(html).toContain('<h3 id="sub">Sub</h3>');
    expect(headings).toHaveLength(2);
    expect(headings[0]).toMatchObject({
      level: 2,
      id: "first-section",
    });
  });

  it("de-duplicates repeated heading ids", () => {
    const { html } = renderLegalMarkdown(
      "## Contact\n\na\n\n## Contact\n\nb",
    );
    expect(html).toContain('id="contact"');
    expect(html).toContain('id="contact-2"');
  });

  it("renders unordered and ordered lists", () => {
    const ul = renderLegalMarkdown("- one\n- two").html;
    expect(ul).toContain("<ul>");
    expect(ul).toContain("<li>one</li>");
    const ol = renderLegalMarkdown("1. a\n2. b").html;
    expect(ol).toContain("<ol>");
    expect(ol).toContain("<li>a</li>");
  });

  it("renders bold, italic, and paragraphs", () => {
    const { html } = renderLegalMarkdown(
      "This is **bold** and *italic* text.",
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<p>");
  });
});
