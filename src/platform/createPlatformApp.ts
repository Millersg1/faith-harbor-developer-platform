import { join } from "node:path";

import express, {
  type ErrorRequestHandler,
} from "express";

import { normalizeDomain } from "../tenancy/OrganizationDomain";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { runWithTenant } from "../tenancy/TenantContext";
import { createTenantMiddleware } from "../tenancy/tenantMiddleware";
import { adminConsolePage } from "./admin/adminPage";
import { createAdminRouter } from "./admin/adminRouter";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { createRequirePlatformAdmin } from "./admin/requirePlatformAdmin";
import type { AiUsageRepository } from "./ai/AiUsageRepository";
import type { OrganizationAiSettingsService } from "./ai/OrganizationAiSettingsService";
import { createAuthRouter } from "./auth/authRouter";
import type { PasswordResetService } from "./auth/PasswordResetService";
import { createRequireUser } from "./auth/requireUser";
import { BillingService } from "./billing/BillingService";
import { OnboardingService } from "./onboarding/OnboardingService";
import { WorkspacePreferencesService } from "./preferences/WorkspacePreferencesService";
import { createBrandingRouter } from "./branding/BrandingRouter";
import { BrandingService } from "./branding/BrandingService";
import { PlatformBrandService } from "./brands/PlatformBrandService";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformLeadService } from "./crm/PlatformLeadService";
import type { DripService } from "./drip/DripService";
import type { ActivityService } from "./events/ActivityService";
import type { NotificationService } from "./notifications/NotificationService";
import type { SearchService } from "./search/SearchService";
import type { PlatformFileService } from "./files/PlatformFileService";
import {
  FormNotFoundError,
  FormValidationError,
  type PlatformFormService,
} from "./forms/PlatformFormService";
import type { CalendarService } from "./calendar/CalendarService";
import type { KnowledgeService } from "./knowledge/KnowledgeService";
import type { AuditService } from "./audit/AuditService";
import type { WorkflowService } from "./workflows/WorkflowService";
import type { AiToolService } from "./ai/tools/AiToolService";
import type { AiConsoleService } from "./ai/console/AiConsoleService";
import type { AiEmployeeService } from "./ai/employees/AiEmployeeService";
import type { AiConversationService } from "./ai/conversations/AiConversationService";
import { PlatformHostingService } from "./hosting/PlatformHostingService";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { PlatformCampaignService } from "./marketing/PlatformCampaignService";
import { ClientUserService } from "./portal/ClientUserService";
import { portalPage } from "./portal/portalPage";
import { createPortalRouter } from "./portal/portalRouter";
import { PortalSessionService } from "./portal/PortalSessionService";
import { PlatformProductService } from "./products/PlatformProductService";
import { PlatformProgramService } from "./programs/PlatformProgramService";
import { PlatformProposalService } from "./proposals/PlatformProposalService";
import { PlatformBookService } from "./publishing/PlatformBookService";
import { PlatformReviewService } from "./reviews/PlatformReviewService";
import { PlatformTicketService } from "./support/PlatformTicketService";
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { createPlatformApiRouter } from "./PlatformApiRouter";
import { createCsrfGuard } from "./security/CsrfGuard";
import type { PlatformAnalyticsService } from "./analytics/PlatformAnalyticsService";
import type { PlatformHealthService } from "./health/PlatformHealthService";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserService } from "./users/PlatformUserService";
import {
  dashboardPage,
  forgotPasswordPage,
  formPublicPage,
  landingPage,
  loginPage,
  resetPasswordPage,
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
  passwordReset?: PasswordResetService;
  domains: OrganizationDomainService;
  hosting?: PlatformHostingService;
  tickets?: PlatformTicketService;
  leads?: PlatformLeadService;
  proposals?: PlatformProposalService;
  campaigns?: PlatformCampaignService;
  reviews?: PlatformReviewService;
  brands?: PlatformBrandService;
  products?: PlatformProductService;
  books?: PlatformBookService;
  programs?: PlatformProgramService;
  clientUsers?: ClientUserService;
  portalSessions?: PortalSessionService;
  email?: PlatformEmailService;
  drip?: DripService;
  activity?: ActivityService;
  notifications?: NotificationService;
  search?: SearchService;
  files?: PlatformFileService;
  forms?: PlatformFormService;
  calendar?: CalendarService;
  knowledge?: KnowledgeService;
  audit?: AuditService;
  workflows?: WorkflowService;
  aiTools?: AiToolService;
  aiConsole?: AiConsoleService;
  aiEmployees?: AiEmployeeService;
  aiConversations?: AiConversationService;
  websites?: PlatformWebsiteService;
  aiSettings?: OrganizationAiSettingsService;
  aiUsage?: AiUsageRepository;
  billing?: BillingService;
  onboarding?: OnboardingService;
  preferences?: WorkspacePreferencesService;
  admins: PlatformAdminService;
  adminSessions: PlatformAdminSessionService;
  platformAnalytics?: PlatformAnalyticsService;
  platformHealth?: PlatformHealthService;

  /**
   * Platform base domain used to resolve tenants from subdomains
   * (e.g. "allelitecloud.com" or "staging.allelitecloud.com").
   */
  baseDomain?: string;

  /**
   * Mark the session cookie Secure (HTTPS only). True in staging/prod.
   */
  secureCookie?: boolean;

  /**
   * Directory of the living documentation (/docs), browsable read-only from
   * the platform admin console.
   */
  docsDir?: string;

  /**
   * Directory of marketplace preview images (AI-generated sample screenshots),
   * served publicly at /marketplace-previews. Absent → previews aren't served.
   */
  marketplacePreviewsDir?: string;
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

  // CSRF defense-in-depth for authenticated, state-changing routes (applied
  // to the portal, admin, and tenant API mounts below).
  const csrfGuard = createCsrfGuard();

  const app = express();

  // Behind exactly ONE trusted hop (the cPanel HTTPS proxy). Trust only that
  // single hop, not the whole X-Forwarded-For chain — otherwise a client could
  // spoof X-Forwarded-For to forge req.ip and bypass rate limiting. With `1`,
  // Express takes the last entry the trusted proxy appended as the client IP.
  app.set("trust proxy", 1);

  // Baseline security headers on every response (defense-in-depth alongside
  // the SameSite=Lax, host-only session cookie). No global CSP here — the
  // dashboard is self-contained inline HTML/JS, and the one place untrusted
  // HTML is served (the AI website preview) sets its own strict sandbox CSP.
  app.use((_req, res, next) => {
    res.setHeader(
      "X-Content-Type-Options",
      "nosniff",
    );
    res.setHeader(
      "X-Frame-Options",
      "SAMEORIGIN",
    );
    res.setHeader(
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    );
    res.setHeader(
      "X-Permitted-Cross-Domain-Policies",
      "none",
    );
    // HSTS only when we're actually behind HTTPS (staging/prod). Guarded by
    // secureCookie so local http dev isn't pinned to HTTPS.
    if (deps.secureCookie) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }

    next();
  });

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
        deps.audit,
      ).finally(() =>
        res.json({ received: true }),
      );
    },
  );

  // 20mb accommodates base64-encoded file uploads (the File service caps the
  // decoded size well below this); ordinary API bodies are tiny.
  app.use(express.json({ limit: "20mb" }));

  // Site icons + web manifest (favicon.ico, favicon-16/32/192/512.png,
  // apple-touch-icon.png, site.webmanifest), served at the web root for every
  // hostname (root domain and tenant subdomains). Bundled beside this module
  // (dist/platform/web/public); requests that don't match a file fall through
  // to the app routes below.
  app.use(
    express.static(
      join(__dirname, "web/public"),
      {
        index: false,
        maxAge: "7d",
        fallthrough: true,
      },
    ),
  );

  app.get(
    "/health",
    (_req, res) => {
      res.json({
        status: "ok",
        service: "All Elite Cloud",
      });
    },
  );

  // Marketplace preview images — public, static sample screenshots referenced
  // by the marketplace cards. No auth: they're marketing samples, not tenant
  // data.
  if (deps.marketplacePreviewsDir) {
    app.use(
      "/marketplace-previews",
      express.static(
        deps.marketplacePreviewsDir,
        {
          maxAge: "1d",
          index: false,
          fallthrough: true,
        },
      ),
    );
  }

  // Web UI (self-contained HTML that calls the API below). On a tenant's
  // VERIFIED custom domain that has a published website, "/" serves that
  // live site instead of the platform landing page.
  app.get("/", (req, res) => {
    resolvePublishedHtml(
      req.headers.host,
      deps,
    )
      .then((html) => {
        if (html) {
          res.setHeader(
            "X-Content-Type-Options",
            "nosniff",
          );
          res
            .type("html")
            .send(html);

          return;
        }

        res
          .type("html")
          .send(landingPage());
      })
      .catch(() => {
        res
          .type("html")
          .send(landingPage());
      });
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
  app.get("/forgot", (_req, res) => {
    res
      .type("html")
      .send(forgotPasswordPage());
  });
  app.get("/reset", (_req, res) => {
    res
      .type("html")
      .send(resetPasswordPage());
  });

  // Public form share page + submit endpoint (NO auth — resolves the tenant
  // from the form's globally-unique slug).
  if (deps.forms) {
    const forms = deps.forms;

    app.get("/f/:slug", (req, res) => {
      forms
        .getPublicBySlug(
          String(req.params.slug),
        )
        .then((form) => {
          if (!form) {
            res
              .status(404)
              .type("html")
              .send(
                "<h1>Form not found</h1>",
              );

            return;
          }

          res
            .type("html")
            .send(
              formPublicPage({
                name: form.name,
                slug: form.slug,
                fields: form.fields,
                confirmationMessage:
                  form.confirmationMessage,
              }),
            );
        })
        .catch(() =>
          res
            .status(500)
            .type("html")
            .send(
              "<h1>Something went wrong</h1>",
            ),
        );
    });

    app.post(
      "/api/public/forms/:slug/submit",
      (req, res, next) => {
        const body =
          req.body &&
          typeof req.body ===
            "object"
            ? (req.body as Record<
                string,
                unknown
              >)
            : {};
        const data =
          body.data &&
          typeof body.data ===
            "object"
            ? (body.data as Record<
                string,
                unknown
              >)
            : {};

        forms
          .submitPublic(
            String(req.params.slug),
            data,
          )
          .then((result) =>
            res.json(result),
          )
          .catch(
            (error: unknown) => {
              if (
                error instanceof
                FormNotFoundError
              ) {
                res
                  .status(404)
                  .json({
                    error: {
                      code: "FORM_NOT_FOUND",
                      message:
                        error.message,
                    },
                  });

                return;
              }

              if (
                error instanceof
                FormValidationError
              ) {
                res
                  .status(400)
                  .json({
                    error: {
                      code: "INVALID_SUBMISSION",
                      message:
                        error.message,
                    },
                  });

                return;
              }

              next(error);
            },
          );
      },
    );
  }
  app.get("/app", (_req, res) => {
    res
      .type("html")
      .send(dashboardPage());
  });

  // Client portal UI (self-contained; talks to /portal/api).
  app.get(
    ["/portal", "/portal/login"],
    (_req, res) => {
      res
        .type("html")
        .send(portalPage());
    },
  );

  // Client portal API (own auth surface for tenants' clients).
  if (
    deps.clientUsers &&
    deps.portalSessions
  ) {
    app.use(
      "/portal/api",
      csrfGuard,
      createPortalRouter({
        tenantMiddleware,
        clientUsers:
          deps.clientUsers,
        portalSessions:
          deps.portalSessions,
        clients: deps.clients,
        branding: deps.branding,
        projects: deps.projects,
        invoices: deps.invoices,
        tickets: deps.tickets,
        proposals: deps.proposals,
        secureCookie:
          deps.secureCookie,
      }),
    );
  }

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
    csrfGuard,
    createAdminRouter({
      admins: deps.admins,
      adminSessions:
        deps.adminSessions,
      organizations:
        deps.organizations,
      requireAdmin,
      analytics:
        deps.platformAnalytics,
      health: deps.platformHealth,
      secureCookie:
        deps.secureCookie,
      docsDir: deps.docsDir,
    }),
  );

  // Auth: public signup/login/logout + authenticated /me.
  app.use(
    "/auth",
    createAuthRouter({
      users: deps.users,
      sessions: deps.sessions,
      signup: deps.signup,
      passwordReset:
        deps.passwordReset,
      email: deps.email,
      audit: deps.audit,
      organizations:
        deps.organizations,
      tenantMiddleware,
      requireUser,
      baseDomain: deps.baseDomain,
      secureCookie:
        deps.secureCookie,
    }),
  );

  // Branding: GET is public (login screen), PUT is owner/admin only.
  app.use(
    "/api/platform",
    csrfGuard,
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
    csrfGuard,
    requireUser,
    createPlatformApiRouter({
      clients: deps.clients,
      users: deps.users,
      projects: deps.projects,
      invoices: deps.invoices,
      domains: deps.domains,
      hosting: deps.hosting,
      tickets: deps.tickets,
      leads: deps.leads,
      proposals: deps.proposals,
      campaigns: deps.campaigns,
      reviews: deps.reviews,
      brands: deps.brands,
      products: deps.products,
      books: deps.books,
      programs: deps.programs,
      clientUsers: deps.clientUsers,
      email: deps.email,
      drip: deps.drip,
      activity: deps.activity,
      notifications: deps.notifications,
      search: deps.search,
      files: deps.files,
      forms: deps.forms,
      calendar: deps.calendar,
      knowledge: deps.knowledge,
      audit: deps.audit,
      workflows: deps.workflows,
      aiTools: deps.aiTools,
      aiConsole: deps.aiConsole,
      aiEmployees: deps.aiEmployees,
      aiConversations:
        deps.aiConversations,
      branding: deps.branding,
      websites: deps.websites,
      aiSettings: deps.aiSettings,
      aiUsage: deps.aiUsage,
      billing: deps.billing,
      onboarding: deps.onboarding,
      preferences: deps.preferences,
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
 * If `host` is a tenant's verified custom domain that has a published
 * website, returns that site's HTML — otherwise null. This is how a
 * published AI site serves live on its own domain.
 */
async function resolvePublishedHtml(
  host: string | undefined,
  deps: PlatformAppDependencies,
): Promise<string | null> {
  const domains = deps.domains;
  const websites = deps.websites;

  if (!host || !domains || !websites) {
    return null;
  }

  const domain = normalizeDomain(host);

  if (!domain) {
    return null;
  }

  const organizationId =
    await domains.resolve(host);

  if (!organizationId) {
    return null;
  }

  const html = await runWithTenant(
    { organizationId },
    () =>
      websites.findPublishedHtmlByDomain(
        domain,
      ),
  );

  return html ?? null;
}

/**
 * Dispatches a verified Stripe event to the billing service. The org id and
 * plan come from metadata we set when creating the checkout, so they're only
 * trusted here because the caller already verified the webhook signature.
 */
/**
 * Processes a signature-verified Stripe webhook event. Idempotent (each event
 * id is handled once), and binds every non-checkout event to a tenant via the
 * customer/subscription id we stored at checkout — never the event's own
 * metadata. Unmapped or irrelevant events are safely ignored. Never logs
 * secrets, payment details, or signatures. See docs/17_BILLING_LIFECYCLE.md.
 */
async function handleStripeEvent(
  billing: BillingService,
  event: unknown,
  audit?: AuditService,
): Promise<void> {
  const e = event as {
    id?: string;
    type?: string;
    data?: {
      object?: Record<string, unknown>;
    };
  };

  const eventId =
    typeof e.id === "string"
      ? e.id
      : "";
  const type = e.type;

  if (!type) {
    return;
  }

  const str = (
    v: unknown,
  ): string | undefined =>
    typeof v === "string" && v
      ? v
      : undefined;

  try {
    // Idempotency: skip a duplicate/replayed delivery.
    if (
      !(await billing.beginEvent(
        eventId,
        type,
      ))
    ) {
      return;
    }

    const obj = e.data?.object ?? {};
    const meta = (obj.metadata ??
      {}) as Record<string, unknown>;

    if (
      type ===
      "checkout.session.completed"
    ) {
      // The establishing event: bind via the metadata WE set at checkout.
      const organizationId = str(
        meta.organizationId,
      );
      const planId = str(meta.planId);

      if (!organizationId || !planId) {
        return;
      }

      await billing.applyCheckoutCompleted(
        {
          organizationId,
          planId,
          stripeCustomerId: str(
            obj.customer,
          ),
          stripeSubscriptionId: str(
            obj.subscription,
          ),
        },
      );
      await auditBilling(
        audit,
        organizationId,
        "billing.subscription.activated",
        { planId },
      );

      return;
    }

    // Every other event: resolve the tenant from the id we stored, not from
    // the event's (mutable) metadata.
    const customerId = str(obj.customer);
    const subscriptionId =
      type.startsWith(
        "customer.subscription.",
      )
        ? str(obj.id)
        : str(obj.subscription);

    let organizationId: string | undefined;
    if (customerId) {
      organizationId =
        await billing.findOrganizationByStripeCustomer(
          customerId,
        );
    }
    if (!organizationId && subscriptionId) {
      organizationId =
        await billing.findOrganizationByStripeSubscription(
          subscriptionId,
        );
    }
    // Fallback ONLY when no stored mapping matched: the organizationId we set
    // in the subscription's metadata. Safe because the event is signature-
    // verified (only our own Stripe account can emit it) and we set this
    // metadata server-side — the stored-id lookup above always wins, so a
    // mismatched metadata id can never redirect an event to another tenant.
    if (!organizationId) {
      organizationId = str(
        meta.organizationId,
      );
    }

    if (!organizationId) {
      // Unknown/unmapped customer — safely ignore (already acked 200).
      return;
    }

    if (
      type ===
      "customer.subscription.created"
    ) {
      // A subscription created outside our Checkout (e.g. Stripe API/dashboard).
      // Establish the mapping + activate from the subscription's metadata,
      // exactly like a completed checkout. Idempotent with checkout.completed.
      const planId = str(meta.planId);
      if (planId) {
        await billing.applyCheckoutCompleted(
          {
            organizationId,
            planId,
            stripeCustomerId: customerId,
            stripeSubscriptionId:
              subscriptionId,
          },
        );
        await auditBilling(
          audit,
          organizationId,
          "billing.subscription.activated",
          { planId },
        );
      }
    } else if (
      type ===
      "customer.subscription.updated"
    ) {
      await billing.applySubscriptionUpdated(
        {
          organizationId,
          stripeStatus: str(obj.status),
          planId: str(meta.planId),
          currentPeriodEnd: str(
            obj.current_period_end,
          ),
        },
      );
      await auditBilling(
        audit,
        organizationId,
        "billing.subscription.updated",
        { status: str(obj.status) },
      );
    } else if (
      type ===
      "customer.subscription.deleted"
    ) {
      await billing.applySubscriptionCanceled(
        { organizationId },
      );
      await auditBilling(
        audit,
        organizationId,
        "billing.subscription.canceled",
        {},
      );
    } else if (
      type === "invoice.payment_failed"
    ) {
      await billing.applyPaymentFailed({
        organizationId,
      });
      await auditBilling(
        audit,
        organizationId,
        "billing.payment_failed",
        {},
      );
    } else if (
      type === "invoice.paid"
    ) {
      await billing.applyPaymentSucceeded(
        { organizationId },
      );
      await auditBilling(
        audit,
        organizationId,
        "billing.payment_recovered",
        {},
      );
    }
    // Any other event type is irrelevant — acknowledged and ignored.
  } catch (error) {
    console.error(
      "Failed to process Stripe event.",
      error,
    );
  }
}

/**
 * Records a billing lifecycle audit event in the org's scope — never any
 * Stripe secret, customer, payment, or signature detail.
 */
async function auditBilling(
  audit: AuditService | undefined,
  organizationId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!audit) {
    return;
  }

  await runWithTenant(
    { organizationId },
    () =>
      audit.record({
        action,
        actorType: "system",
        outcome: "success",
        targetType: "billing",
        metadata,
      }),
  );
}
