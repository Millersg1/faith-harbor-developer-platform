import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import {
  MarketingSenderRepository,
  MarketingSenderService,
  MarketingSenderValidationError,
} from "./MarketingSenderService";
import { buildMarketingEmail } from "./marketingEmailContent";

const PLATFORM_FROM = "no-reply@allelitecloud.com";

function svc() {
  return new MarketingSenderService(
    new MarketingSenderRepository(),
    PLATFORM_FROM,
    () => "2026-01-01T00:00:00.000Z",
  );
}

describe("MarketingSenderService — domain safety & fail-closed", () => {
  it("uses the platform fallback when the tenant's From domain is NOT approved", async () => {
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const s = svc();
      await s.set(
        {
          businessName: "Institute Co",
          fromAddress: "hello@institute.test", // set, but NOT approved
          replyTo: "reply@institute.test",
          physicalAddress: "1 Main St, Town, OH 44000",
        },
        "owner-1",
      );
      const r = await s.resolve();
      expect(r.ok).toBe(true);
      if (r.ok) {
        // Fallback From on the authenticated AEC domain, tenant name + reply-to.
        expect(r.sender.fromAddress).toBe(PLATFORM_FROM);
        expect(r.sender.usingPlatformFallback).toBe(true);
        expect(r.sender.fromName).toBe("Institute Co");
        expect(r.sender.replyTo).toBe("reply@institute.test");
      }
    });
  });

  it("website/custom-domain ownership is NOT email-sending approval (still fallback)", async () => {
    await runWithTenant({ organizationId: "orgW" }, async () => {
      const s = svc();
      // Even with a from_address on the tenant's verified website domain, without
      // explicit sending-domain approval the visible From stays the platform's.
      await s.set(
        {
          businessName: "Owns A Website",
          fromAddress: "team@verified-website.test",
          replyTo: "reply@verified-website.test",
          physicalAddress: "2 Oak Ave, City, OH 44001",
        },
        "owner-1",
      );
      const r = await s.resolve();
      expect(r.ok && r.sender.fromAddress).toBe(PLATFORM_FROM);
    });
  });

  it("honors the tenant's From only when the sending domain is platform-approved", async () => {
    await runWithTenant({ organizationId: "orgB" }, async () => {
      const s = svc();
      await s.set(
        {
          businessName: "Approved Co",
          fromAddress: "news@approved.test",
          replyTo: "reply@approved.test",
          physicalAddress: "3 Pine Rd, Village, OH 44002",
          sendingDomainApproved: true, // platform-set
        },
        "owner-1",
      );
      const r = await s.resolve();
      expect(r.ok && r.sender.fromAddress).toBe("news@approved.test");
      expect(r.ok && r.sender.usingPlatformFallback).toBe(false);
    });
  });

  it("fails closed when the physical mailing address is missing", async () => {
    await runWithTenant({ organizationId: "orgC" }, async () => {
      const s = svc();
      await s.set(
        { businessName: "No Addr Co", replyTo: "reply@x.test" },
        "owner-1",
      );
      const r = await s.resolve();
      expect(r).toEqual({ ok: false, reason: "missing_physical_address" });
    });
  });

  it("rejects CR/LF-injected and malformed sender fields", async () => {
    await runWithTenant({ organizationId: "orgD" }, async () => {
      const s = svc();
      await expect(
        s.set({ businessName: "Evil\r\nBcc: victim@x.com" }, "owner-1"),
      ).rejects.toBeInstanceOf(MarketingSenderValidationError);
      await expect(
        s.set({ replyTo: "not-an-email" }, "owner-1"),
      ).rejects.toBeInstanceOf(MarketingSenderValidationError);
    });
  });

  it("audit payload is field names + status only — never addresses", async () => {
    await runWithTenant({ organizationId: "orgE" }, async () => {
      const s = svc();
      const out = await s.set(
        {
          businessName: "Audit Co",
          replyTo: "reply@audit.test",
          physicalAddress: "4 Elm, Town, OH",
        },
        "owner-1",
      );
      expect(out.changedFields.sort()).toEqual([
        "businessName",
        "physicalAddress",
        "replyTo",
      ]);
      expect(out.status).toBe("ready");
      expect(JSON.stringify(out)).not.toContain("reply@audit.test");
      expect(JSON.stringify(out)).not.toContain("4 Elm");
    });
  });
});

describe("buildMarketingEmail — compliant, safe content", () => {
  const sender = {
    fromName: "Institute Co",
    fromAddress: "no-reply@allelitecloud.com",
    replyTo: "reply@institute.test",
    physicalAddress: "1 Main St, Town, OH 44000",
    usingPlatformFallback: true,
  };
  const base = {
    sender,
    subject: "Spring news",
    text: "Hello there",
    unsubscribeUrl: "https://institute.test/unsubscribe#u=TOKEN123",
    oneClickUrl: "https://institute.test/api/unsubscribe/one-click/TOKEN123",
  };

  it("stamps a safe From, reply-to, and subject", () => {
    const m = buildMarketingEmail({ ...base, subject: "Spring\r\nBcc: x@y.com" });
    expect(m.from).toBe('"Institute Co" <no-reply@allelitecloud.com>');
    expect(m.replyTo).toBe("reply@institute.test");
    expect(m.subject).toBe("SpringBcc: x@y.com"); // CR/LF stripped, no header break
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("includes a VISIBLE unsubscribe link in BOTH html and plain text", () => {
    const m = buildMarketingEmail(base);
    expect(m.text).toContain("Unsubscribe: https://institute.test/unsubscribe#u=TOKEN123");
    expect(m.html).toContain('href="https://institute.test/unsubscribe#u=TOKEN123"');
  });

  it("includes the physical mailing address in both formats", () => {
    const m = buildMarketingEmail(base);
    expect(m.text).toContain("1 Main St, Town, OH 44000");
    expect(m.html).toContain("1 Main St, Town, OH 44000");
  });

  it("sets List-Unsubscribe (one-click endpoint) + one-click POST header; no fragment in header", () => {
    const m = buildMarketingEmail(base);
    expect(m.headers["List-Unsubscribe"]).toBe(
      "<https://institute.test/api/unsubscribe/one-click/TOKEN123>",
    );
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // The browser fragment link must NOT appear in any header.
    expect(JSON.stringify(m.headers)).not.toContain("#u=");
  });

  it("renders the tiny Markdown subset (bold/italic/heading/http link) safely", () => {
    const m = buildMarketingEmail({
      ...base,
      text: "# Hi\n\nSome **bold** and *italic* and a [link](https://ok.test/x).",
    });
    expect(m.html).toContain("<h1>Hi</h1>");
    expect(m.html).toContain("<strong>bold</strong>");
    expect(m.html).toContain("<em>italic</em>");
    expect(m.html).toContain('<a href="https://ok.test/x">link</a>');
  });

  it("escapes business name and physical address interpolated into HTML", () => {
    const m = buildMarketingEmail({
      ...base,
      sender: {
        ...sender,
        fromName: 'Björn "Q" & Sons',
        physicalAddress: "<img src=x onerror=alert(1)> 1 St",
      },
    });
    // Legitimate Unicode/quotes/punctuation in the From display name survive.
    expect(m.from).toContain("Björn");
    // The physical-address HTML injection is escaped, never live markup.
    expect(m.html).not.toMatch(/<img/i);
    expect(m.html).toContain("&lt;img");
  });
});

describe("buildMarketingEmail — adversarial body (escape-then-subset, no HTML parsing)", () => {
  const sender = {
    fromName: "Co",
    fromAddress: "no-reply@allelitecloud.com",
    replyTo: "reply@co.test",
    physicalAddress: "1 St, OH",
    usingPlatformFallback: true,
  };
  const wrap = (text: string) =>
    buildMarketingEmail({
      sender,
      subject: "s",
      text,
      unsubscribeUrl: "https://co.test/unsubscribe#u=T",
      oneClickUrl: "https://co.test/api/unsubscribe/one-click/T",
    }).html;

  const payloads: [string, string][] = [
    ["script tag", "<script>evil()</script>"],
    ["nested/malformed tags", "<div><scr<script>ipt>x</script></div>"],
    ["mixed-case javascript link", "[x](JaVaScRiPt:alert(1))"],
    ["encoded javascript link", "[x](java	script:alert(1))"],
    ["html entities", "&lt;script&gt;&#60;img&#62;"],
    ["svg", "<svg/onload=alert(1)>"],
    ["mathml", "<math><mtext></mtext></math>"],
    ["srcdoc", '<iframe srcdoc="<script>x</script>">'],
    ["event handler w/ whitespace", "<a\n onerror = alert(1) >x</a>"],
    ["css url expression", '<div style="background:url(javascript:x)">'],
    ["data scheme link", "[x](data:text/html,<script>alert(1)</script>)"],
    ["blob scheme link", "[x](blob:https://co.test/abc)"],
    ["file scheme link", "[x](file:///etc/passwd)"],
    ["tracking pixel", '<img src="https://track.evil/p.gif?e=1" width=1 height=1>'],
    ["broken quotes", '<a href="https://x onclick=alert(1)>x'],
    ["html comment", "<!-- <script>x</script> -->"],
    ["null/control chars", "a b<script>x</script>"],
  ];

  for (const [name, payload] of payloads) {
    it(`neutralizes: ${name}`, () => {
      const html = wrap(payload);
      // Escape-then-subset means a hostile payload becomes inert TEXT. The proof
      // is structural: only our fixed tag set exists, and every anchor href is
      // http/https (never javascript/data/blob/file). A literal "javascript:"
      // inside an escaped paragraph is harmless — it is not in a live context.
      const tags = [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((x) => x[1].toLowerCase());
      const allowed = new Set(["p", "br", "hr", "a", "strong", "em", "h1", "h2", "h3"]);
      for (const t of tags) expect(allowed.has(t)).toBe(true);
      // The ONLY attributes our generator emits are href (anchors) + style (our
      // own footer). No event handlers or foreign attributes can appear.
      for (const href of [...html.matchAll(/href="([^"]*)"/gi)].map((x) => x[1])) {
        expect(href).toMatch(/^https?:/);
      }
      expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i); // no on*="..." handler
    });
  }
});
