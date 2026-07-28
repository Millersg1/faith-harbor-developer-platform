import { describe, expect, it } from "vitest";

import { dashboardPage, loginPage } from "./pages";

const html = dashboardPage();

describe("dashboardPage — theme tokens", () => {
  it("defines --card and --line in :root (no undefined-token regression)", () => {
    expect(html).toMatch(/:root[^}]*--card:/);
    expect(html).toMatch(/:root[^}]*--line:/);
    expect(html).toMatch(/--accent-ink:/);
  });

  it("never falls back to light values that create white cards on dark bg", () => {
    expect(html).not.toContain("var(--card,#fff)");
    expect(html).not.toContain("var(--line,#e5e7eb)");
    expect(html).not.toContain("var(--line,#eee)");
    // The same guard on the login page (shares the token block).
    expect(loginPage()).not.toContain("var(--card,#fff)");
  });
});

describe("dashboardPage — Website workspace", () => {
  it("has an accessible sub-navigation (tablist) with the six sections", () => {
    expect(html).toContain(
      'class="websubnav"',
    );
    expect(html).toContain(
      'role="tablist"',
    );
    for (const label of [
      "My Websites",
      "Create Website",
      "AI Employee Marketplace",
      "Website Templates",
      "Hosting &amp; Domains",
      "Branding",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("tags every Website panel with data-websub and provides the dialog host", () => {
    expect(html).toContain(
      'data-websub="mywebsites"',
    );
    expect(html).toContain(
      'data-websub="create"',
    );
    expect(html).toContain(
      'data-websub="marketplace"',
    );
    expect(html).toContain(
      'data-websub="templates"',
    );
    expect(html).toContain(
      'id="dlgHost"',
    );
  });

  it("keeps AI-employee packages and standalone templates distinct in copy", () => {
    // AI Employee Marketplace explicitly mentions a role-focused AI employee.
    expect(html).toContain(
      "role-focused",
    );
    expect(html).toMatch(
      /AI employee/i,
    );
    // Website Templates explicitly state no AI employee is included.
    expect(html).toMatch(
      /No AI employee is included/i,
    );
  });

  it("uses honest AutoSSL wording (policy, not a live SSL status claim)", () => {
    expect(html).toMatch(
      /SSL is provisioned automatically after a domain verifies|AutoSSL/i,
    );
    // No unconditional "SSL active/issued" claim in the static copy.
    expect(html).not.toMatch(
      /SSL (Active|Issued|Certificate Issued)/,
    );
  });
});

describe("dashboardPage — AI workspace", () => {
  it("has an accessible AI sub-navigation with the five sections", () => {
    expect(html).toContain(
      'class="aisubnav"',
    );
    expect(html).toContain(
      'id="aisubnav"',
    );
    for (const label of [
      "Command Center",
      "AI Employees",
      "Actions &amp; Approvals",
      "Knowledge Base",
      "Usage &amp; Settings",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("tags every AI panel with data-aisub", () => {
    for (const sub of [
      "command",
      "employees",
      "actions",
      "knowledge",
      "usage",
    ]) {
      expect(html).toContain(
        `data-aisub="${sub}"`,
      );
    }
  });

  it("renders the Command Center as a conversation workspace", () => {
    expect(html).toContain(
      'id="aiThreads"',
    );
    expect(html).toContain(
      'id="aiChatLog"',
    );
    expect(html).toContain(
      'id="aiEmployeeSelect"',
    );
    // A textarea composer with a status region for screen readers.
    expect(html).toMatch(
      /<textarea id="aiChatInput"/,
    );
    expect(html).toContain(
      'id="aiStatus"',
    );
    expect(html).toContain(
      'role="status"',
    );
  });

  it("styles chat and AI form controls for the dark theme (no white textareas)", () => {
    // textarea is grouped with input/select in the dark control rule.
    expect(html).toMatch(
      /input,\s*select,\s*textarea/,
    );
    expect(html).toMatch(
      /textarea\s*\{[^}]*resize:/,
    );
    // The tool picker and approval card have their own dark surfaces.
    expect(html).toMatch(/\.toolpick\s*\{/);
    expect(html).toMatch(
      /\.approve-card\s*\{/,
    );
  });

  it("keeps the API key write-only and never echoes a stored key", () => {
    // The key input is a password field and its label says write-only.
    expect(html).toMatch(
      /id="aiKey"[^>]*type="password"/,
    );
    expect(html).toMatch(
      /write-only/i,
    );
    // The static page must not embed any real-looking secret.
    expect(html).not.toMatch(
      /sk-[A-Za-z0-9]{20,}/,
    );
  });

  it("is honest about knowledge ingestion (text only, no fake uploads)", () => {
    expect(html).toMatch(
      /Text entry is the supported ingestion method/i,
    );
    // The Knowledge Base panel itself must not advertise unsupported uploads.
    const start = html.indexOf(
      'id="aisub-knowledge"',
    );
    const end = html.indexOf(
      "<div class=\"panel\"",
      start + 1,
    );
    const kbPanel = html.slice(
      start,
      end,
    );
    expect(kbPanel).not.toContain(
      'type="file"',
    );
  });
});

describe("dashboardPage — accent badge contrast & responsive metrics", () => {
  it("fills accent badges with the accent and puts accent-ink on top (not accent text on a tint)", () => {
    // The `.pill` badge (e.g. the 2/6 onboarding count) must use the accent as
    // background with accent-ink text, so it stays readable for any brand color.
    expect(html).toMatch(
      /\.pill\s*\{[^}]*background:\s*var\(--accent\)[^}]*color:\s*var\(--accent-ink\)/,
    );
    // The active nav tab also uses accent-ink on the accent fill.
    expect(html).toMatch(
      /\.secnav a\.active\s*\{[^}]*var\(--accent-ink\)/,
    );
  });

  it("uses a responsive metric grid (no fixed 5+2 / no overflow) with breakpoints", () => {
    expect(html).toContain(".metrics {");
    // Column count adapts by width (phone/tablet/desktop).
    expect(html).toMatch(
      /@media \(min-width: 940px\)[^}]*\.metrics/,
    );
    // minmax(0, 1fr) guards against horizontal overflow from long labels.
    expect(html).toContain(
      "minmax(0, 1fr)",
    );
  });
});

describe("dashboardPage — accessibility & structure", () => {
  it("renders the onboarding progress with progressbar semantics", () => {
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("gives icon-only controls accessible names", () => {
    expect(html).toContain('aria-label="Search"');
    expect(html).toContain('aria-label="Notifications"');
  });

  it("has a personalized greeting and metrics/quick-action containers", () => {
    expect(html).toContain('id="greeting"');
    expect(html).toContain('id="metrics"');
    expect(html).toContain('id="quickActions"');
  });
});

describe("dashboardPage — embedded tested helpers", () => {
  it("embeds the pure format/validation helpers so the browser runs tested code", () => {
    expect(html).toContain("function progressPercent");
    expect(html).toContain("function greetingFor");
    expect(html).toContain("function safeAccent");
    expect(html).toContain("function accentInk");
  });

  it("keeps the HTML-escape helper and renders API data via textContent", () => {
    // Data is rendered with textContent (never innerHTML from API data).
    expect(html).toContain("function esc(");
    expect(html).not.toContain(".innerHTML=d.");
  });
});
