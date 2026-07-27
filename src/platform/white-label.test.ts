import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  EmailMessage,
  EmailResult,
} from "../communications/EmailTypes";
import type { EmailTransport } from "../communications/EmailTransport";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import type { OrganizationBrandingRecord } from "./branding/OrganizationBranding";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import {
  brandAccent,
  brandLockupHtml,
  brandName,
  DEFAULT_BRAND_ACCENT,
  DEFAULT_BRAND_NAME,
  escapeHtml,
} from "./branding/brandingTheme";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { renderBrandedEmailHtml } from "./email/emailLayout";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { renderInvoiceDocument } from "./invoices/invoiceDocument";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { ClientUserRepository } from "./portal/ClientUserRepository";
import { ClientUserService } from "./portal/ClientUserService";
import { PortalSessionRepository } from "./portal/PortalSessionRepository";
import { PortalSessionService } from "./portal/PortalSessionService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRecord } from "./invoices/PlatformInvoice";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

const BRAND: OrganizationBrandingRecord = {
  organizationId: "org",
  displayName: "Bright Studio",
  primaryColor: "#ff4400",
  logoUrl:
    "https://cdn.example.com/logo.png",
  supportEmail: "hi@bright.studio",
  updatedAt:
    "2026-01-01T00:00:00.000Z",
};

describe("brandingTheme helpers", () => {
  it("escapes HTML special characters", () => {
    expect(
      escapeHtml(
        `<script>"&'`,
      ),
    ).toBe(
      "&lt;script&gt;&quot;&amp;&#39;",
    );
  });

  it("falls back to platform defaults when unbranded", () => {
    expect(brandName(undefined)).toBe(
      DEFAULT_BRAND_NAME,
    );
    expect(
      brandAccent(undefined),
    ).toBe(DEFAULT_BRAND_ACCENT);
  });

  it("uses the tenant name and a valid hex accent", () => {
    expect(brandName(BRAND)).toBe(
      "Bright Studio",
    );
    expect(brandAccent(BRAND)).toBe(
      "#ff4400",
    );
  });

  it("rejects a malformed accent color (no CSS injection)", () => {
    expect(
      brandAccent({
        organizationId: "o",
        primaryColor:
          "red;} body{display:none}",
        updatedAt: "",
      }),
    ).toBe(DEFAULT_BRAND_ACCENT);
  });

  it("renders a logo img only for an https url, else text", () => {
    expect(
      brandLockupHtml(BRAND, {
        color: "#000",
      }),
    ).toContain("<img");

    const textLockup = brandLockupHtml(
      {
        organizationId: "o",
        displayName: "Plain Co",
        logoUrl:
          "http://insecure/logo.png",
        updatedAt: "",
      },
      { color: "#000" },
    );
    expect(textLockup).not.toContain(
      "<img",
    );
    expect(textLockup).toContain(
      "Plain Co",
    );
  });
});

const INVOICE: PlatformInvoiceRecord = {
  id: "inv1",
  organizationId: "org",
  number: "INV-0007",
  clientId: "c1",
  status: "sent",
  currency: "USD",
  lineItems: [
    {
      description: "Design work",
      quantity: 3,
      unitPrice: 100,
    },
  ],
  amount: 300,
  issueDate: "2026-02-01",
  dueDate: "2026-02-15",
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
};

describe("renderInvoiceDocument", () => {
  it("renders the invoice number, total, and brand", () => {
    const html = renderInvoiceDocument({
      invoice: INVOICE,
      client: { name: "Acme Co" },
      branding: BRAND,
    });

    expect(html).toContain("INV-0007");
    expect(html).toContain("USD 300.00");
    expect(html).toContain(
      "Bright Studio",
    );
    expect(html).toContain("Acme Co");
    expect(html).toContain(
      "window.print()",
    );
  });

  it("escapes a malicious client name", () => {
    const html = renderInvoiceDocument({
      invoice: INVOICE,
      client: {
        name: "<script>alert(1)</script>",
      },
      branding: BRAND,
    });

    expect(html).not.toContain(
      "<script>alert(1)",
    );
    expect(html).toContain(
      "&lt;script&gt;",
    );
  });

  it("renders cleanly with no branding and no client", () => {
    const html = renderInvoiceDocument({
      invoice: {
        ...INVOICE,
        clientId: undefined,
      },
    });

    expect(html).toContain(
      DEFAULT_BRAND_NAME,
    );
    expect(html).toContain("INV-0007");
  });
});

describe("renderBrandedEmailHtml", () => {
  it("wraps the body and carries the brand", () => {
    const html = renderBrandedEmailHtml(
      BRAND,
      {
        body: "Hello there.\n\nSecond paragraph.",
      },
    );

    expect(html).toContain(
      "Bright Studio",
    );
    expect(html).toContain(
      "Hello there.",
    );
    expect(html).toContain(
      "Second paragraph.",
    );
    expect(html).toContain(
      "hi@bright.studio",
    );
  });

  it("escapes the body and renders an optional CTA", () => {
    const html = renderBrandedEmailHtml(
      undefined,
      {
        body: "<b>x</b>",
        cta: {
          label: "View",
          url: "https://x.test/a",
        },
      },
    );

    expect(html).not.toContain(
      "<b>x</b>",
    );
    expect(html).toContain(
      "https://x.test/a",
    );
    expect(html).toContain("View");
    // Unbranded → platform default.
    expect(html).toContain(
      DEFAULT_BRAND_NAME,
    );
  });
});

/** Captures the last message a transport was asked to send. */
class CapturingTransport
  implements EmailTransport
{
  last: EmailMessage | undefined;

  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    this.last = message;
    return {
      status: "sent",
      provider: "capture",
    };
  }
}

describe("White-label API (HTTP)", () => {
  async function buildApp(
    transport?: CapturingTransport,
  ) {
    const organizations =
      new OrganizationService();
    const users =
      new PlatformUserService(
        new PlatformUserRepository(),
      );
    const sessions =
      new PlatformSessionService(
        new PlatformSessionRepository(),
      );
    const clients =
      new PlatformClientService(
        new PlatformClientRepository(),
      );
    const branding =
      new BrandingService(
        new BrandingRepository(),
      );

    const app = createPlatformApp({
      organizations,
      users,
      sessions,
      branding,
      clients,
      projects:
        new PlatformProjectService(
          new PlatformProjectRepository(),
          clients,
        ),
      invoices:
        new PlatformInvoiceService(
          new PlatformInvoiceRepository(),
          clients,
        ),
      email: transport
        ? new PlatformEmailService(
            undefined,
            transport,
            { connected: true },
          )
        : new PlatformEmailService(),
      clientUsers:
        new ClientUserService(
          new ClientUserRepository(),
          clients,
        ),
      portalSessions:
        new PortalSessionService(
          new PortalSessionRepository(),
        ),
      signup:
        new PlatformSignupService(
          organizations,
          users,
          sessions,
        ),
      domains:
        new OrganizationDomainService(),
      admins:
        new PlatformAdminService(),
      adminSessions:
        new PlatformAdminSessionService(),
      baseDomain: "allelitecloud.com",
    });

    const signup = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Acme",
        slug: "acme",
        email: "owner@acme.com",
        password: "password123",
      });

    const cookie =
      signup.headers["set-cookie"];

    await request(app)
      .put("/api/platform/branding")
      .set("Cookie", cookie)
      .send({
        displayName: "Acme Brand",
        primaryColor: "#123456",
      });

    return { app, cookie };
  }

  it("serves a branded, print-ready invoice document", async () => {
    const { app, cookie } =
      await buildApp();

    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({
        name: "Portal Co",
        email: "p@co.test",
      });

    const invoice = await request(app)
      .post("/api/platform/invoices")
      .set("Cookie", cookie)
      .send({
        clientId:
          client.body.client.id,
        lineItems: [
          {
            description: "Work",
            quantity: 2,
            unitPrice: 50,
          },
        ],
      });

    const res = await request(app)
      .get(
        `/api/platform/invoices/${invoice.body.invoice.id}/printable`,
      )
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "text/html",
    );
    expect(res.text).toContain(
      "Acme Brand",
    );
    expect(res.text).toContain(
      "Portal Co",
    );
    expect(res.text).toContain(
      "INV-0001",
    );
  });

  it("sends a branded HTML email from the tenant composer", async () => {
    const transport =
      new CapturingTransport();
    const { app, cookie } =
      await buildApp(transport);

    const res = await request(app)
      .post("/api/platform/emails")
      .set("Cookie", cookie)
      .send({
        to: "someone@x.test",
        subject: "Hi",
        body: "Plain message body.",
      });

    expect(res.status).toBe(201);
    expect(
      transport.last?.html,
    ).toBeTruthy();
    // The HTML carries the tenant brand; the plain body is preserved.
    expect(
      transport.last?.html,
    ).toContain("Acme Brand");
    expect(transport.last?.body).toBe(
      "Plain message body.",
    );
  });

  it("exposes tenant branding to a signed-in portal client", async () => {
    const { app, cookie } =
      await buildApp();

    const client = await request(app)
      .post("/api/platform/clients")
      .set("Cookie", cookie)
      .send({ name: "Client A" });

    await request(app)
      .post(
        "/api/platform/portal-users",
      )
      .set("Cookie", cookie)
      .send({
        clientId:
          client.body.client.id,
        email: "a@client.test",
        password: "portalpass1",
      });

    const login = await request(app)
      .post(
        "/portal/api/auth/login",
      )
      .set("X-Org-Slug", "acme")
      .send({
        email: "a@client.test",
        password: "portalpass1",
      });
    expect(login.status).toBe(200);

    const res = await request(app)
      .get("/portal/api/branding")
      .set(
        "Cookie",
        login.headers[
          "set-cookie"
        ] as unknown as string[],
      );

    expect(res.status).toBe(200);
    expect(
      res.body.branding.displayName,
    ).toBe("Acme Brand");
    expect(
      res.body.branding.primaryColor,
    ).toBe("#123456");
  });
});
