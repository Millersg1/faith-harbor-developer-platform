import express, {
  type ErrorRequestHandler,
} from "express";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { createTenantMiddleware } from "../tenancy/tenantMiddleware";
import { adminConsolePage } from "./admin/adminPage";
import { createAdminRouter } from "./admin/adminRouter";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { createRequirePlatformAdmin } from "./admin/requirePlatformAdmin";
import { createAuthRouter } from "./auth/authRouter";
import { createRequireUser } from "./auth/requireUser";
import { BillingService } from "./billing/BillingService";
import { createBrandingRouter } from "./branding/BrandingRouter";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { createPlatformApiRouter } from "./PlatformApiRouter";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserService } from "./users/PlatformUserService";
import {
  dashboardPage,
  landingPage,
  loginPage,
  signupPage,
} from "./web/pages";

export interface PlatformAppDependencies {
  organizations: OrganizationService;
  users: PlatformUserService;
  sessions: PlatformSessionService;
  branding: BrandingService;
  clients: PlatformClientService;
  projects: PlatformProjectService;
  invoices: PlatformInvoiceService;
  signup: PlatformSignupService;
  domains: OrganizationDomainService;
  billing?: BillingService;
  admins: PlatformAdminService;
  adminSessions: PlatformAdminSessionService;

  /**
   * Platform base domain used to resolve tenants from subdomains
   * (e.g. "allelitecloud.com" or "staging.allelitecloud.com").
   */
  baseDomain?: string;

  /**
   * Mark the session cookie Secure (HTTPS only). True in staging/prod.
   */
  secureCookie?: boolean;
}

/**
 * Assembles the All Elite Cloud platform into a single Express app.
 *
 * This is the composition root: it wires the tenant middleware, auth
 * (signup/login/sessions), white-label branding, and the tenant-scoped
 * API into one application. It takes already-constructed services, so the
 * same assembly runs against Postgres in production and against in-memory
 * repositories in tests.
 */
export function createPlatformApp(
  deps: PlatformAppDependencies,
): express.Express {
  const tenantMiddleware =
    createTenantMiddleware(
      deps.organizations,
      {
        baseDomain: deps.baseDomain,
        domains: deps.domains,
      },
    );

  const requireUser =
    createRequireUser({
      sessions: deps.sessions,
      users: deps.users,
    });

  const app = express();

  app.use(express.json());

  app.get(
    "/health",
    (_req, res) => {
      res.json({
        status: "ok",
        service: "All Elite Cloud",
      });
    },
  );

  // Web UI (self-contained HTML that calls the API below).
  app.get("/", (_req, res) => {
    res.type("html").send(
      landingPage(),
    );
  });
  app.get("/login", (_req, res) => {
    res
      .type("html")
      .send(loginPage());
  });
  app.get("/signup", (_req, res) => {
    res
      .type("html")
      .send(signupPage());
  });
  app.get("/app", (_req, res) => {
    res
      .type("html")
      .send(dashboardPage());
  });

  // Platform administration (All Elite Cloud, cross-tenant).
  const requireAdmin =
    createRequirePlatformAdmin({
      adminSessions:
        deps.adminSessions,
      admins: deps.admins,
    });

  app.get(
    "/platform/admin",
    (_req, res) => {
      res
        .type("html")
        .send(adminConsolePage());
    },
  );

  app.use(
    "/platform/admin/api",
    createAdminRouter({
      admins: deps.admins,
      adminSessions:
        deps.adminSessions,
      organizations:
        deps.organizations,
      requireAdmin,
      secureCookie:
        deps.secureCookie,
    }),
  );

  // Auth: public signup/login/logout + authenticated /me.
  app.use(
    "/auth",
    createAuthRouter({
      users: deps.users,
      sessions: deps.sessions,
      signup: deps.signup,
      organizations:
        deps.organizations,
      tenantMiddleware,
      requireUser,
      secureCookie:
        deps.secureCookie,
    }),
  );

  // Branding: GET is public (login screen), PUT is owner/admin only.
  app.use(
    "/api/platform",
    createBrandingRouter({
      branding: deps.branding,
      tenantMiddleware,
      requireUser,
    }),
  );

  // Authenticated tenant-scoped API (falls through here after the
  // branding routes above have had their chance).
  app.use(
    "/api/platform",
    requireUser,
    createPlatformApiRouter({
      clients: deps.clients,
      projects: deps.projects,
      invoices: deps.invoices,
      domains: deps.domains,
      billing: deps.billing,
    }),
  );

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Not found.",
      },
    });
  });

  const errorHandler: ErrorRequestHandler =
    (error, _req, res, _next) => {
      console.error(
        "Platform request failed.",
        error,
      );

      res.status(500).json({
        error: {
          code: "INTERNAL",
          message:
            "Something went wrong.",
        },
      });
    };

  app.use(errorHandler);

  return app;
}
