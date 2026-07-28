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
