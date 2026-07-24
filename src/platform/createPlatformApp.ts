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
import { PlatformHostingService } from "./hosting/PlatformHostingService";
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
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
  hosting?: PlatformHostingService;
  websites?: PlatformWebsiteService;
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

  // Stripe webhook — MUST be registered before express.json(), because
  // signature verification needs the exact raw request body. The signature
  // is verified before we trust anything in the payload (including the org
  // id we act on).
  app.post(
    "/webhooks/stripe",
    express.raw({ type: "*/*" }),
    (req, res) => {
      const billing = deps.billing;
      const raw = Buffer.isBuffer(
        req.body,
      )
        ? req.body.toString("utf8")
        : "";
      const signature = req.headers[
        "stripe-signature"
      ] as string | undefined;

      if (
        !billing ||
        !billing.verifyWebhook(
          raw,
          signature,
        )
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_SIGNATURE",
            message:
              "Invalid webhook signature.",
          },
        });

        return;
      }

      let event: unknown;

      try {
        event = JSON.parse(raw);
      } catch {
        res.status(400).end();

        return;
      }

      // Always ack 200 so Stripe doesn't retry on our processing errors.
      handleStripeEvent(
        billing,
        event,
      ).finally(() =>
        res.json({ received: true }),
      );
    },
  );

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
      hosting: deps.hosting,
      websites: deps.websites,
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

/**
 * Dispatches a verified Stripe event to the billing service. The org id and
 * plan come from metadata we set when creating the checkout, so they're only
 * trusted here because the caller already verified the webhook signature.
 */
async function handleStripeEvent(
  billing: BillingService,
  event: unknown,
): Promise<void> {
  const e = event as {
    type?: string;
    data?: {
      object?: Record<string, unknown>;
    };
  };

  const obj = e.data?.object ?? {};
  const meta = (obj.metadata ??
    {}) as Record<string, unknown>;
  const organizationId =
    typeof meta.organizationId ===
    "string"
      ? meta.organizationId
      : undefined;

  if (!organizationId) {
    return;
  }

  try {
    if (
      e.type ===
      "checkout.session.completed"
    ) {
      const planId =
        typeof meta.planId === "string"
          ? meta.planId
          : undefined;

      if (!planId) {
        return;
      }

      await billing.applyCheckoutCompleted(
        {
          organizationId,
          planId,
          stripeCustomerId:
            typeof obj.customer ===
            "string"
              ? obj.customer
              : undefined,
          stripeSubscriptionId:
            typeof obj.subscription ===
            "string"
              ? obj.subscription
              : undefined,
        },
      );
    } else if (
      e.type ===
      "customer.subscription.deleted"
    ) {
      await billing.applySubscriptionCanceled(
        { organizationId },
      );
    }
  } catch (error) {
    console.error(
      "Failed to process Stripe event.",
      error,
    );
  }
}
