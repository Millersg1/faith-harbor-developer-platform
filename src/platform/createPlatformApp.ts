import { join } from "node:path";

import { createHmac, randomBytes } from "node:crypto";

import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
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
  isOriginAllowed,
  type PlatformFormService,
} from "./forms/PlatformFormService";
import type { FormRecord } from "./forms/PlatformForm";
import { RateLimiter, rateLimit } from "./security/RateLimiter";
import { requireRole } from "./auth/requireRole";
import type { AuthedRequest } from "./auth/requireUser";
import type { UnsubscribeService } from "./marketing/EmailSuppressionService";
import type { DoubleOptInService } from "./marketing/DoubleOptInService";
import type { MarketingConsentService } from "./marketing/MarketingConsentService";
import type { MarketingActivationService } from "./marketing/MarketingActivationService";
import type { MarketingOutboxService } from "./marketing/MarketingOutboxService";
import type { MarketingPauseService } from "./marketing/MarketingPauseService";
import type { ConfirmationDispatchService } from "./marketing/ConfirmationDispatchService";
import { createMarketingOpsRouter } from "./marketing/marketingOpsRouter";
import type { LeadMagnetCapabilityService } from "./magnet/LeadMagnetCapabilityService";
import type { LeadMagnetDownloadSessionService } from "./magnet/LeadMagnetDownloadSessionService";
import type { LeadMagnetDispatchService } from "./magnet/LeadMagnetDispatchService";
import type { LeadMagnetFulfillmentService } from "./magnet/LeadMagnetFulfillmentService";
import { createLeadMagnetDownloadRouter } from "./magnet/leadMagnetDownloadRouter";
import { createMagnetOpsRouter } from "./magnet/magnetOpsRouter";
import type { EmailVerificationService } from "./auth/EmailVerificationService";
import type { MarketingSenderService } from "./marketing/MarketingSenderService";
import type { EmailDeliveryProvider } from "./email/EmailDeliveryProvider";
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
import type { PlatformLegalService } from "./legal/PlatformLegalService";
import type { LegalAcceptanceService } from "./legal/LegalAcceptanceService";
import {
  isLegalKind,
  legalKindsInOrder,
} from "./legal/PlatformLegalDocument";
import {
  legalDocumentPage,
  legalIndexPage,
  legalNotPublishedPage,
} from "./legal/legalPages";
import type { TenantLegalService } from "./tenantlegal/TenantLegalService";
import { createTenantLegalRouter } from "./tenantlegal/tenantLegalRouter";
import { tenantLegalPage } from "./tenantlegal/tenantLegalPages";
import {
  kindForSlug,
  tenantLegalKindsInOrder,
} from "./tenantlegal/TenantLegalDocument";
import type { PrivacyRequestService } from "./privacy/PrivacyRequestService";
import { PrivacyValidationError } from "./privacy/PrivacyRequestService";
import type { PlatformAuditService } from "./audit/PlatformAuditService";
import { createPrivacyManagementRouter } from "./privacy/privacyManagementRouter";
import {
  privacyIntakePage,
  privacyStatusPage,
  privacyStatusPlaceholderPage,
  privacyVerifyExchangePage,
  privacyVerifyResultPage,
} from "./privacy/privacyPages";
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
  /** No-login unsubscribe (tenant-scoped) + one-click. */
  unsubscribe?: UnsubscribeService;
  /** Double-opt-in confirmation. */
  doubleOptIn?: DoubleOptInService;
  /** Records/confirms marketing consent on double-opt-in confirmation. */
  marketingConsent?: MarketingConsentService;
  /** Binds the marketing activation (awaiting→ready) on confirmation. */
  marketingActivations?: MarketingActivationService;
  /** Durable marketing outbox (owner/admin review + delivery-unknown workflow). */
  marketingOutbox?: MarketingOutboxService;
  /** Durable marketing pause state (owner/admin pause/resume controls). */
  marketingPause?: MarketingPauseService;
  /** Confirmation dispatch (owner/admin visibility of stuck confirmations). */
  confirmationDispatch?: ConfirmationDispatchService;
  /** Lead-magnet download capabilities (public capability-gated download). */
  magnetCapabilities?: LeadMagnetCapabilityService;
  /** Lead-magnet one-time download sessions (the hardened cookie exchange). */
  magnetSessions?: LeadMagnetDownloadSessionService;
  /** Durable transactional lead-magnet email dispatch (owner/admin review). */
  magnetDispatch?: LeadMagnetDispatchService;
  /** Lead-magnet fulfillment records (owner/admin status). */
  magnetFulfillment?: LeadMagnetFulfillmentService;
  /** Whether a configured transactional sender exists (email-mode warning). */
  transactionalSenderConfigured?: boolean;
  /** Account-email verification (platform transactional). */
  emailVerification?: EmailVerificationService;
  /** Tenant marketing sender resolution (for the labeled test email). */
  marketingSender?: MarketingSenderService;
  /** Provider-independent email delivery (honest SMTP classification). */
  emailProvider?: EmailDeliveryProvider;
  /**
   * The application's configured + authenticated transactional sender identity
   * (the same From used by the existing email service). Account-verification
   * email uses THIS — never an invented `no-reply@<domain>`. Absent = no
   * approved transactional sender, so verification email fails closed (nothing
   * is sent) rather than fabricating an address. `from` may be a bare address
   * or a `Name <address>` form; it is never echoed in public responses/logs.
   */
  transactionalSender?: { from: string };
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
  legal?: PlatformLegalService;
  legalAcceptance?: LegalAcceptanceService;
  tenantLegal?: TenantLegalService;
  privacy?: PrivacyRequestService;
  platformAudit?: PlatformAuditService;
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

  // Platform legal documents — All Elite Cloud's OWN policies, served at
  // stable /legal/* URLs on every host. Global (not tenant-scoped). Only
  // PUBLISHED documents render their body; an unpublished kind shows an honest
  // "being finalized" notice, never a draft or a fabricated policy.
  const legal = deps.legal;
  app.get("/legal", (_req, res) => {
    const published = new Set<string>();
    const kinds = legalKindsInOrder();
    Promise.all(
      kinds.map((m) =>
        (legal
          ? legal.getPublished(m.kind)
          : Promise.resolve(undefined)
        ).then((doc) => {
          if (doc) {
            published.add(m.kind);
          }
        }),
      ),
    )
      .then(() => {
        res
          .type("html")
          .send(legalIndexPage(published));
      })
      .catch(() => {
        res
          .type("html")
          .send(legalIndexPage(published));
      });
  });
  app.get("/legal/:slug", (req, res, next) => {
    const slug = String(req.params.slug);
    if (!isLegalKind(slug)) {
      next();
      return;
    }
    if (!legal) {
      res
        .type("html")
        .send(legalNotPublishedPage(slug));
      return;
    }
    legal
      .getPublished(slug)
      .then((doc) => {
        if (!doc) {
          res
            .type("html")
            .send(legalNotPublishedPage(slug));
          return;
        }
        legal
          .listVersions(slug)
          .then((versions) => {
            const prior = versions.filter(
              (v) => v.status === "superseded",
            );
            res
              .type("html")
              .send(legalDocumentPage(doc, prior));
          })
          .catch(() => {
            res
              .type("html")
              .send(legalDocumentPage(doc, []));
          });
      })
      .catch(() => {
        res
          .type("html")
          .send(legalNotPublishedPage(slug));
      });
  });

  // Public TENANT legal pages — a tenant's OWN published documents, served on
  // that tenant's host at stable slugs (/privacy, /terms, /cookies,
  // /refund-policy, /accessibility, /ai-disclosure, /acceptable-use,
  // /subprocessors). Resolves the tenant from the host (verified custom domain
  // or subdomain slug); only PUBLISHED documents render, never a draft, never
  // cross-tenant. On the apex host or an unknown/not-published kind it falls
  // through to the 404 handler.
  if (deps.tenantLegal) {
    const tenantLegal = deps.tenantLegal;
    for (const meta of tenantLegalKindsInOrder()) {
      app.get(`/${meta.slug}`, (req, res, next) => {
        const kind = kindForSlug(meta.slug);
        if (!kind) {
          next();
          return;
        }
        resolveTenantByHost(req.headers.host, deps)
          .then((resolved) => {
            if (!resolved) {
              next();
              return;
            }
            return runWithTenant(
              { organizationId: resolved.organizationId },
              async () => {
                const doc =
                  await tenantLegal.getPublished(kind);
                if (!doc) {
                  return null;
                }
                const q =
                  await tenantLegal.getQuestionnaire();
                const brand = deps.branding
                  ? await deps.branding
                      .get()
                      .catch(() => undefined)
                  : undefined;
                const businessName =
                  q.answers.publicName ||
                  q.answers.legalName ||
                  resolved.orgName ||
                  "";
                return { doc, businessName, brand };
              },
            ).then((result) => {
              if (!result) {
                next();
                return;
              }
              res.setHeader(
                "X-Content-Type-Options",
                "nosniff",
              );
              res.type("html").send(
                tenantLegalPage(
                  {
                    businessName: result.businessName,
                    primaryColor:
                      result.brand?.primaryColor,
                  },
                  result.doc,
                ),
              );
            });
          })
          .catch(() => next());
      });
    }
  }

  // Public PRIVACY-REQUEST intake, verification, and requester status. The
  // SERVER decides the destination from the trusted resolved host: the apex
  // platform host → a "platform" request (about All Elite Cloud itself); a
  // resolved tenant host → a "tenant" request scoped to that organization. A
  // client-supplied organization id is never trusted.
  if (deps.privacy) {
    const privacy = deps.privacy;
    // Per-IP + per-email limiter for public submissions (independent of the
    // auth limiters). 5 submissions / 10 min / (ip,email).
    const privacyLimiter = new RateLimiter({
      max: 5,
      windowMs: 10 * 60 * 1000,
    });
    const submitRateLimit = rateLimit({
      limiter: privacyLimiter,
      scope: "privacy-submit",
      keyPart: (req) =>
        String(
          (req.body as { email?: unknown })?.email ?? "",
        )
          .trim()
          .toLowerCase()
          .slice(0, 254),
    });
    // Tighter limiter for verification resend (anti-abuse): 3 / 15 min /
    // (ip,email). Independent of the submit limiter.
    const resendLimiter = new RateLimiter({
      max: 3,
      windowMs: 15 * 60 * 1000,
    });
    const resendRateLimit = rateLimit({
      limiter: resendLimiter,
      scope: "privacy-resend",
      keyPart: (req) =>
        String(
          (req.body as { email?: unknown })?.email ?? "",
        )
          .trim()
          .toLowerCase()
          .slice(0, 254),
    });

    interface IntakeCtx {
      destination: "platform" | "tenant";
      organizationId: string | null;
      brandName: string;
      linkHost: string;
    }

    // FAIL-CLOSED host classification for intake creation. Returns null (→ 404)
    // for any host that is neither the configured apex NOR a resolved tenant.
    // An unknown/forged/malformed host is NEVER silently accepted as a platform
    // request. (The baseDomain fallback below is only for safe LINK generation,
    // not authorization to accept an invalid host.)
    const classifyIntake = async (
      host: string | undefined,
    ): Promise<IntakeCtx | null> => {
      const domain = normalizeDomain(host ?? "");
      if (!domain) {
        return null;
      }
      const base = deps.baseDomain
        ? deps.baseDomain.toLowerCase()
        : "";
      if (base && (domain === base || domain === `www.${base}`)) {
        return {
          destination: "platform",
          organizationId: null,
          brandName: "All Elite Cloud",
          linkHost: base,
        };
      }
      const resolved = await resolveTenantByHost(host, deps);
      if (resolved) {
        return {
          destination: "tenant",
          organizationId: resolved.organizationId,
          brandName: resolved.orgName || "This business",
          linkHost: domain,
        };
      }
      return null;
    };

    // Non-authorizing brand context for the token-gated verify/status pages
    // (the token is the capability; the host only affects branding).
    const brandCtx = async (
      host: string | undefined,
    ): Promise<IntakeCtx> => {
      return (
        (await classifyIntake(host)) ?? {
          destination: "platform",
          organizationId: null,
          brandName: "All Elite Cloud",
          linkHost: deps.baseDomain || normalizeDomain(host ?? "") || "",
        }
      );
    };

    const linkBase = (ctx: { linkHost: string }): string => {
      const proto = deps.secureCookie ? "https" : "http";
      return `${proto}://${ctx.linkHost}`;
    };

    // ---- Token-safe transport helpers ----
    // Verification and status tokens are NEVER placed in a query string or the
    // visible URL. They travel in the URL *fragment* (never sent to the server,
    // so they can't reach an access log or Referer) and are exchanged, via a
    // POST body, for a short-lived HttpOnly status-session cookie. These headers
    // keep the token-processing pages out of caches, indexes, and referrers.
    const PRIV_STATUS_COOKIE = "pr_status";
    const PRIV_COOKIE_PATH = "/privacy-request/status";
    const setPrivacyHeaders = (res: Response): void => {
      res.set("Referrer-Policy", "no-referrer");
      res.set("Cache-Control", "no-store, private, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("X-Content-Type-Options", "nosniff");
    };
    const readStatusCookie = (req: Request): string | undefined => {
      const raw = req.headers.cookie;
      if (!raw) return undefined;
      for (const part of raw.split(";")) {
        const i = part.indexOf("=");
        if (i === -1) continue;
        if (part.slice(0, i).trim() === PRIV_STATUS_COOKIE) {
          return decodeURIComponent(part.slice(i + 1).trim());
        }
      }
      return undefined;
    };
    const setStatusCookie = (res: Response, token: string): void => {
      res.cookie(PRIV_STATUS_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: Boolean(deps.secureCookie),
        path: PRIV_COOKIE_PATH,
        maxAge: 90 * 24 * 60 * 60 * 1000,
      });
    };
    const isFormPost = (req: Request): boolean =>
      /application\/x-www-form-urlencoded/.test(
        String(req.headers["content-type"] ?? ""),
      );

    // Send the verification email and record its HONEST, persisted delivery
    // state. The raw token appears ONLY in the email body (fragment link) —
    // never in the response, a log, or the delivery-state error. Best-effort:
    // a delivery failure is recorded (state=failed/logged), never claimed as
    // sent, and never throws into intake/resend.
    const sendVerificationEmail = async (
      ctx: { brandName: string; linkHost: string },
      record: { id: string; email: string; organizationId: string | null },
      verifyToken: string,
    ): Promise<void> => {
      const verifyUrl = `${linkBase(ctx)}/privacy-request/verify#v=${verifyToken}`;
      const body = `We received a privacy request. Please verify your email by opening:\n\n${verifyUrl}\n\nThis link expires in 72 hours. If you did not make this request, you can ignore this message.`;
      const subject = `Verify your privacy request to ${ctx.brandName}`;
      if (!deps.email || !deps.email.connected()) {
        // No real provider configured — recorded, NOT delivered (never "sent").
        await privacy.recordVerificationDelivery(record.id, {
          state: "logged",
          error: deps.email ? "email provider not configured" : "no transport",
        });
        return;
      }
      const mailer = deps.email;
      try {
        const result = record.organizationId
          ? await runWithTenant(
              { organizationId: record.organizationId },
              () => mailer.send({ to: record.email, subject, body }),
            )
          : await mailer.send({ to: record.email, subject, body });
        const st = result.status;
        await privacy.recordVerificationDelivery(record.id, {
          state:
            st === "sent" ? "sent" : st === "logged" ? "logged" : "failed",
          error: st === "failed" ? result.error ?? "delivery failed" : null,
        });
      } catch (e) {
        await privacy.recordVerificationDelivery(record.id, {
          state: "failed",
          error: e instanceof Error ? e.message : "send error",
        });
      }
    };

    app.get("/privacy-request", (req, res, next) => {
      classifyIntake(req.headers.host)
        .then((ctx) => {
          if (!ctx) {
            next();
            return;
          }
          setPrivacyHeaders(res);
          res.type("html").send(
            privacyIntakePage({
              brandName: ctx.brandName,
              destinationLabel: ctx.destination,
            }),
          );
        })
        .catch(() => next());
    });

    app.post(
      "/privacy-requests",
      csrfGuard,
      submitRateLimit,
      (req, res, next) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        classifyIntake(req.headers.host)
          .then(async (ctx) => {
            if (!ctx) {
              // Unknown/forged/malformed host — fail closed. The destination is
              // derived ONLY from the trusted host; any client-supplied
              // organizationId/destination in the body is ignored entirely.
              next();
              return;
            }
            const run = () =>
              privacy.create({
                destination: ctx.destination,
                organizationId: ctx.organizationId,
                category: String(body.category ?? ""),
                name: String(body.name ?? ""),
                email: String(body.email ?? ""),
                description: String(body.description ?? ""),
                relationship:
                  typeof body.relationship === "string"
                    ? body.relationship
                    : undefined,
              });
            const created =
              ctx.destination === "tenant" && ctx.organizationId
                ? await runWithTenant(
                    { organizationId: ctx.organizationId },
                    run,
                  )
                : await run();
            // Best-effort, honest verification email with persisted delivery
            // state. The raw token appears ONLY in the email (fragment link).
            await sendVerificationEmail(
              { brandName: ctx.brandName, linkHost: ctx.linkHost },
              {
                id: created.record.id,
                email: created.record.email,
                organizationId: ctx.organizationId,
              },
              created.verifyToken,
            );
            res.json({
              message:
                "Thank you. If the details are valid, a verification email is on its way. Check your inbox to confirm your address.",
            });
          })
          .catch((e) => {
            if (e instanceof PrivacyValidationError) {
              res.status(400).json({
                error: {
                  code: "INVALID_REQUEST",
                  message: e.message,
                },
              });
              return;
            }
            // Enumeration-resistant: never reveal internal details.
            res.status(400).json({
              error: {
                code: "INVALID_REQUEST",
                message: "Could not submit the request.",
              },
            });
          });
      },
    );

    // POST resend — re-send the verification email for an UNVERIFIED request.
    // Host-classified (same fail-closed rule as submit); rotates the existing
    // request's token (no duplicate request, no lifecycle change); ALWAYS
    // returns the same generic response so it can't enumerate emails.
    app.post(
      "/privacy-requests/resend",
      csrfGuard,
      resendRateLimit,
      (req, res, next) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const email = String(body.email ?? "");
        classifyIntake(req.headers.host)
          .then(async (ctx) => {
            if (!ctx) {
              next();
              return;
            }
            const scope =
              ctx.destination === "tenant" && ctx.organizationId
                ? { kind: "tenant" as const, organizationId: ctx.organizationId }
                : { kind: "platform" as const };
            const rotated =
              ctx.destination === "tenant" && ctx.organizationId
                ? await runWithTenant(
                    { organizationId: ctx.organizationId },
                    () => privacy.resendVerification(scope, email),
                  )
                : await privacy.resendVerification(scope, email);
            if (rotated) {
              await sendVerificationEmail(
                { brandName: ctx.brandName, linkHost: ctx.linkHost },
                {
                  id: rotated.record.id,
                  email: rotated.record.email,
                  organizationId: ctx.organizationId,
                },
                rotated.verifyToken,
              );
            }
            // Generic either way — never reveals whether a request existed.
            res.json({
              message:
                "If a pending request matches that email, we've sent a new verification link.",
            });
          })
          .catch(() => {
            res.json({
              message:
                "If a pending request matches that email, we've sent a new verification link.",
            });
          });
      },
    );

    // GET verify — serve a NEUTRAL exchange page. The token is in the URL
    // fragment (never sent here), so this GET consumes nothing and is safe for
    // email link-scanners/prefetchers. The single-use consumption happens on
    // the POST below.
    app.get("/privacy-request/verify", (req, res, next) => {
      brandCtx(req.headers.host)
        .then((ctx) => {
          setPrivacyHeaders(res);
          res
            .type("html")
            .send(
              privacyVerifyExchangePage({
                brandName: ctx.brandName,
                destinationLabel: ctx.destination,
              }),
            );
        })
        .catch(() => next());
    });

    // POST verify — exchange the single-use verification token (JSON body from
    // the exchange script, or `code` from the no-JS form) for a status session.
    // On success we set the HttpOnly status cookie, best-effort email the
    // durable private status link, and hand off to the clean, token-free
    // status URL. No token is ever echoed in a redirect target or logged.
    app.post(
      "/privacy-request/verify",
      express.urlencoded({ extended: false }),
      csrfGuard,
      (req, res) => {
        const form = isFormPost(req);
        const body = (req.body ?? {}) as Record<string, unknown>;
        const token =
          typeof body.token === "string"
            ? body.token
            : typeof body.code === "string"
              ? body.code.trim()
              : "";
        Promise.all([brandCtx(req.headers.host), privacy.verifyEmail(token)])
          .then(async ([ctx, result]) => {
            setPrivacyHeaders(res);
            if ("record" in result) {
              setStatusCookie(res, result.statusToken);
              // Best-effort: email the requester their durable private status
              // link (fragment form — never a query string). sendQuietly never
              // throws; a failure here doesn't strand the verified request.
              if (deps.email) {
                const statusLink = `${linkBase(ctx)}/privacy-request/status#s=${result.statusToken}`;
                const send = () =>
                  deps.email!.sendQuietly({
                    to: result.record.email,
                    subject: `Your privacy request status link (${ctx.brandName})`,
                    body: `Your email is verified. You can check the status of your privacy request at any time using this private link:\n\n${statusLink}\n\nKeep this link private to you.`,
                  });
                if (result.record.organizationId) {
                  await runWithTenant(
                    { organizationId: result.record.organizationId },
                    () => send(),
                  ).catch(() => undefined);
                } else {
                  await send().catch(() => undefined);
                }
              }
              if (form) {
                res.redirect(303, "/privacy-request/status");
                return;
              }
              res.json({ ok: true, redirect: "/privacy-request/status" });
              return;
            }
            if (form) {
              res
                .status(400)
                .type("html")
                .send(
                  privacyVerifyResultPage(
                    {
                      brandName: ctx.brandName,
                      destinationLabel: ctx.destination,
                    },
                    result.error,
                  ),
                );
              return;
            }
            res.json({ ok: false, reason: result.error });
          })
          .catch(() => {
            setPrivacyHeaders(res);
            if (form) {
              res.status(400).type("html").send("Bad request");
            } else {
              res.status(400).json({ ok: false, reason: "invalid" });
            }
          });
      },
    );

    // GET status — cookie-gated. With a valid status-session cookie we render
    // the redacted view server-side (works without JavaScript). Without one we
    // serve a neutral placeholder whose script exchanges a `#s=` fragment link
    // for the cookie, then reloads this same clean URL. The visible URL never
    // carries a token in either path.
    app.get("/privacy-request/status", (req, res, next) => {
      const cookieToken = readStatusCookie(req);
      brandCtx(req.headers.host)
        .then(async (ctx) => {
          setPrivacyHeaders(res);
          const pageCtx = {
            brandName: ctx.brandName,
            destinationLabel: ctx.destination,
          };
          if (!cookieToken) {
            res.type("html").send(privacyStatusPlaceholderPage(pageCtx));
            return;
          }
          const view = await privacy.requesterStatus(cookieToken);
          if (!view) {
            // Stale/revoked cookie — clear it and show the neutral placeholder.
            res.clearCookie(PRIV_STATUS_COOKIE, { path: PRIV_COOKIE_PATH });
            res.type("html").send(privacyStatusPlaceholderPage(pageCtx));
            return;
          }
          // Refresh the sliding session and render the redacted view.
          setStatusCookie(res, cookieToken);
          res.type("html").send(privacyStatusPage(pageCtx, view));
        })
        .catch(() => next());
    });

    // POST status exchange — trade a `#s=` fragment status token (JSON body, or
    // `code` from the no-JS form) for the HttpOnly status cookie. Returns no
    // requester data; the browser then loads the clean status URL.
    app.post(
      "/privacy-request/status/exchange",
      express.urlencoded({ extended: false }),
      csrfGuard,
      (req, res) => {
        const form = isFormPost(req);
        const body = (req.body ?? {}) as Record<string, unknown>;
        const token =
          typeof body.token === "string"
            ? body.token
            : typeof body.code === "string"
              ? body.code.trim()
              : "";
        privacy
          .requesterStatus(token)
          .then((view) => {
            setPrivacyHeaders(res);
            if (view) {
              setStatusCookie(res, token);
              if (form) {
                res.redirect(303, "/privacy-request/status");
                return;
              }
              res.json({ ok: true });
              return;
            }
            if (form) {
              res.redirect(303, "/privacy-request/status");
              return;
            }
            res.json({ ok: false });
          })
          .catch(() => {
            setPrivacyHeaders(res);
            if (form) {
              res.status(400).type("html").send("Bad request");
            } else {
              res.status(400).json({ ok: false });
            }
          });
      },
    );
  }

  // Public form share page + submit endpoint (NO auth — resolves the tenant
  // from the form's globally-unique slug).
  if (deps.forms) {
    const forms = deps.forms;

    // --- Public-form abuse controls (independent of CORS) ---
    // Per-IP+form and per-email+form rate limiters. Generic 429 + Retry-After.
    const formIpLimiter = new RateLimiter({ max: 30, windowMs: 10 * 60 * 1000 });
    const formEmailLimiter = new RateLimiter({ max: 6, windowMs: 10 * 60 * 1000 });
    // Short-window idempotency for double-clicks / browser retries (in-memory;
    // seconds-scale — durable enrollment idempotency is handled separately).
    const submitIdemp = new Map<string, { at: number; body: unknown }>();
    const IDEMP_TTL_MS = 2 * 60 * 1000;
    // Per-process secret for short-lived form tokens (timing anti-bot). A
    // restart simply invalidates outstanding tokens (the visitor reloads).
    const formTokenSecret = randomBytes(32);
    const issueFormToken = (): string => {
      const ts = String(Date.now());
      const mac = createHmac("sha256", formTokenSecret)
        .update(ts)
        .digest("base64url");
      return `${ts}.${mac}`;
    };
    const formTokenAgeMs = (token: unknown): number | null => {
      if (typeof token !== "string" || !token.includes(".")) return null;
      const [ts, mac] = token.split(".");
      const expected = createHmac("sha256", formTokenSecret)
        .update(ts)
        .digest("base64url");
      if (mac !== expected) return null;
      const n = Number(ts);
      return Number.isFinite(n) ? Date.now() - n : null;
    };
    // Derive the client IP through the app's trusted-proxy config (`trust
    // proxy = 1`), NOT arbitrary X-Forwarded-For. `req.ip` respects the single
    // trusted hop, so a client cannot spoof XFF to forge it.
    const clientIp = (req: Request): string =>
      req.ip || req.socket.remoteAddress || "unknown";
    // Store only a KEYED HASH of the IP as abuse/consent evidence — never the
    // raw IP. Privacy-minimizing: lets you correlate "same IP" without
    // retaining the address. Truncated; a restart rotates the key.
    const hashIp = (ip: string): string =>
      createHmac("sha256", formTokenSecret).update(ip).digest("hex").slice(0, 16);
    // Reduce a URL to origin+path only — dropping the query string, fragment,
    // and any credentials — so we never persist URL tokens, consent/email
    // tokens, or sensitive query parameters. Length-limited.
    const sanitizeUrl = (raw: unknown): string | undefined => {
      if (typeof raw !== "string" || !raw.trim()) return undefined;
      try {
        const u = new URL(raw.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
        return `${u.origin}${u.pathname}`.slice(0, 512);
      } catch {
        return undefined;
      }
    };
    const extractEmail = (data: Record<string, unknown>): string => {
      for (const v of Object.values(data)) {
        if (typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) {
          return v.trim().toLowerCase();
        }
      }
      return "";
    };

    // PER-FORM CORS (deny-by-default). CORS is a browser access policy — NOT
    // authentication and NOT spam protection — and the form slug is PUBLIC (it
    // appears in the embedding page source), never a secret or authorization.
    // A cross-origin browser embed is allowed ONLY for the form's explicitly
    // configured origins (or an explicit allow-any opt-in). Disallowed origins
    // get NO permissive CORS header. Credentials are never allowed. Abuse
    // protection (rate limit / honeypot / timing / size / idempotency /
    // fail-closed tenant scoping) is enforced separately, below.
    type PublicFormReq = express.Request & {
      publicForm?: FormRecord;
      canonicalBase?: string;
    };
    const applyFormCors = (
      res: Response,
      form: FormRecord | undefined,
      origin: string | undefined,
    ): void => {
      res.set("Vary", "Origin");
      if (form && isOriginAllowed(form.settings, origin)) {
        res.set(
          "Access-Control-Allow-Origin",
          form.settings.allowAnyOrigin ? "*" : String(origin),
        );
        res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.set(
          "Access-Control-Allow-Headers",
          "Content-Type, Idempotency-Key, X-Form-Token",
        );
        res.set("Access-Control-Max-Age", "600");
      }
    };
    const publicFormCtx: express.RequestHandler = (req, res, next) => {
      forms
        .getPublicBySlug(String(req.params.slug))
        .then(async (form) => {
          (req as PublicFormReq).publicForm = form;
          applyFormCors(res, form, req.headers.origin);
          if (req.method === "OPTIONS") {
            res.status(204).end();
            return;
          }
          if (form) {
            // HOST-BINDING (allowlist, fail-closed). Public form API access is
            // permitted ONLY through: (a) the configured AEC apex host,
            // (b) the form OWNER's canonical tenant subdomain, or (c) a verified
            // custom domain that resolves to the form owner. Everything else —
            // unknown Host, unverified custom domain, malformed Host, another
            // tenant's host, forged/conflicting forwarded-host — is refused with
            // the SAME generic 404 (no tenant/form existence leak). We use the
            // real `Host` via the trusted resolver and IGNORE X-Forwarded-Host
            // and any client-supplied org id / host / redirect. CORS-origin
            // authorization is enforced SEPARATELY (applyFormCors above).
            const domain = normalizeDomain(req.headers.host ?? "");
            const base = deps.baseDomain
              ? deps.baseDomain.toLowerCase()
              : "";
            const isApex =
              !!base && (domain === base || domain === `www.${base}`);
            let allowed = isApex;
            if (!allowed) {
              const resolved = await resolveTenantByHost(
                req.headers.host,
                deps,
              ).catch(() => null);
              allowed = !!resolved && resolved.organizationId === form.organizationId;
            }
            if (!allowed) {
              (req as PublicFormReq).publicForm = undefined;
              res.status(404).json({
                error: {
                  code: "FORM_NOT_FOUND",
                  message: "This form is not available.",
                },
              });
              return;
            }
            // Links ALWAYS use the form OWNER's trusted canonical host (its
            // subdomain) — even when accessed via the apex — never the incoming
            // request host, apex, Origin, or another tenant.
            const org = await deps.organizations
              .get(form.organizationId)
              .catch(() => undefined);
            if (org && deps.baseDomain) {
              const proto = deps.secureCookie ? "https" : "http";
              (req as PublicFormReq).canonicalBase =
                `${proto}://${org.slug}.${deps.baseDomain}`;
            }
          }
          next();
        })
        .catch(() => next());
    };
    app.options("/api/public/forms/:slug", publicFormCtx);
    app.options("/api/public/forms/:slug/submit", publicFormCtx);

    // Public form CONFIG (JSON) — lets an external page render the form's
    // fields dynamically. Returns only public, non-sensitive fields (never the
    // owner notify email, organization id, internal settings, or lead config).
    app.get(
      "/api/public/forms/:slug",
      publicFormCtx,
      (req, res) => {
        const form = (req as PublicFormReq).publicForm;
        if (!form) {
          res.status(404).json({
            error: {
              code: "FORM_NOT_FOUND",
              message: "This form is not available.",
            },
          });
          return;
        }
        res.json({
          form: {
            name: form.name,
            slug: form.slug,
            fields: form.fields,
            confirmationMessage: form.confirmationMessage,
            // A short-lived, signed token so cooperating embeds can prove a
            // minimum completion time (anti-bot). Optional to use.
            formToken: issueFormToken(),
            minSubmitSeconds: form.settings.minSubmitSeconds ?? 0,
          },
        });
      },
    );

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
      publicFormCtx,
      (req, res, next) => {
        const form = (req as PublicFormReq).publicForm;
        // Fail closed: unknown OR inactive form → generic 404, no tenant leak.
        if (!form || form.status !== "active") {
          res.status(404).json({
            error: {
              code: "FORM_NOT_FOUND",
              message: "This form is not available.",
            },
          });
          return;
        }
        // ORIGIN SUBMISSION RESTRICTION (defense-in-depth, NOT authentication).
        // DECISION: when a form configures an allowed-origins list, a BROWSER
        // submission (one carrying an Origin) is accepted only from a same-host
        // page or an allowed origin — otherwise it is refused BEFORE any lead /
        // consent / attribution / activation / magnet / enrollment / outbox
        // mutation. A request WITHOUT an Origin (non-browser / server-to-server)
        // is NOT blocked here — Origin is forgeable/omittable, so it can never be
        // authentication; those requests are governed by the abuse controls
        // below (rate limit, honeypot, timing, size, idempotency) + host-binding
        // + suppression. A form with no allowlist (or allowAnyOrigin) is open.
        {
          const origin = req.headers.origin;
          const restrict =
            !!form.settings.allowedOrigins?.length &&
            !form.settings.allowAnyOrigin;
          if (restrict && typeof origin === "string" && origin) {
            const reqHost = String(req.headers.host ?? "")
              .toLowerCase()
              .split(":")[0];
            let originHost = "\0";
            try {
              originHost = new URL(origin).hostname.toLowerCase();
            } catch {
              originHost = "\0";
            }
            if (originHost !== reqHost && !isOriginAllowed(form.settings, origin)) {
              res.status(403).json({
                error: {
                  code: "ORIGIN_NOT_ALLOWED",
                  message: "This form cannot be submitted from here.",
                },
              });
              return;
            }
          }
        }
        const genericOk = { confirmationMessage: form.confirmationMessage };
        const body =
          req.body && typeof req.body === "object"
            ? (req.body as Record<string, unknown>)
            : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : {};

        // Request-size guard (independent of the global 20mb JSON limit).
        if (JSON.stringify(data).length > 32_768) {
          res.status(413).json({
            error: { code: "PAYLOAD_TOO_LARGE", message: "Submission too large." },
          });
          return;
        }

        // Honeypot: a bot filling the hidden field → accept generically, drop.
        const hp = form.settings.honeypotField;
        if (hp && typeof data[hp] === "string" && data[hp].trim() !== "") {
          res.json(genericOk);
          return;
        }

        // Minimum completion time (only when a valid form token is presented).
        const minMs = (form.settings.minSubmitSeconds ?? 0) * 1000;
        if (minMs > 0) {
          const age = formTokenAgeMs(body.formToken);
          if (age !== null && age < minMs) {
            res.json(genericOk); // too fast → drop generically (bot)
            return;
          }
        }

        const ip = clientIp(req);
        const email = extractEmail(data);
        // Rate limit by IP+form and (when present) email+form. Generic 429.
        const ipHit = formIpLimiter.hit(`${form.id}:${ip}`);
        const emailHit = email
          ? formEmailLimiter.hit(`${form.id}:${email}`)
          : { allowed: true, retryAfterMs: 0 };
        if (!ipHit.allowed || !emailHit.allowed) {
          const retryMs = Math.max(ipHit.retryAfterMs, emailHit.retryAfterMs);
          res.set("Retry-After", String(Math.ceil(retryMs / 1000)));
          res.status(429).json({
            error: { code: "RATE_LIMITED", message: "Too many submissions. Try again later." },
          });
          return;
        }

        // Idempotency: an explicit Idempotency-Key, else a hash of the payload,
        // dedupes double-clicks / browser retries within a short window.
        const idempKeyRaw =
          typeof req.headers["idempotency-key"] === "string"
            ? req.headers["idempotency-key"]
            : createHmac("sha256", formTokenSecret)
                .update(`${form.id}:${email}:${JSON.stringify(data)}`)
                .digest("base64url");
        const idempKey = `${form.id}:${idempKeyRaw}`;
        const now = Date.now();
        for (const [k, v] of submitIdemp) {
          if (now - v.at > IDEMP_TTL_MS) submitIdemp.delete(k);
        }
        const prior = submitIdemp.get(idempKey);
        if (prior) {
          res.json(prior.body);
          return;
        }

        // Attribution (data-minimized): keyed IP hash (never raw IP, never
        // user-agent) + client-supplied landing/referrer reduced to origin+path
        // + capped UTMs. All optional; never fabricated.
        const meta =
          body.meta && typeof body.meta === "object"
            ? (body.meta as Record<string, unknown>)
            : {};
        const utm =
          meta.utm && typeof meta.utm === "object"
            ? (meta.utm as Record<string, unknown>)
            : {};
        // UTM values are short labels — length-limit and strip control chars.
        const tag = (v: unknown): string | undefined => {
          if (typeof v !== "string" || !v.trim()) return undefined;
          const cleaned = Array.from(v.trim())
            .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
            .join("");
          return cleaned.slice(0, 200) || undefined;
        };
        const attribution = {
          ipHash: ip && ip !== "unknown" ? hashIp(ip) : undefined,
          referrer: sanitizeUrl(meta.referrer) ?? sanitizeUrl(req.headers.referer),
          landingUrl: sanitizeUrl(meta.landingUrl),
          utmSource: tag(utm.source),
          utmMedium: tag(utm.medium),
          utmCampaign: tag(utm.campaign),
          utmContent: tag(utm.content),
          utmTerm: tag(utm.term),
          leadMagnetId: tag(meta.leadMagnetId),
        };

        // Public context for the opt-in policy + confirmation-link host. The
        // policy FORCES double opt-in unless the Origin is a trustworthy,
        // allowlisted browser origin.
        const submitOrigin =
          typeof req.headers.origin === "string" ? req.headers.origin : undefined;
        const submitCtx = {
          origin: submitOrigin,
          originAllowlisted: submitOrigin
            ? isOriginAllowed(form.settings, submitOrigin)
            : false,
          canonicalBase: (req as PublicFormReq).canonicalBase,
        };
        forms
          .submitPublic(String(req.params.slug), data, attribution, submitCtx)
          .then((result) => {
            submitIdemp.set(idempKey, { at: now, body: result });
            res.json(result);
          })
          .catch((error: unknown) => {
            if (error instanceof FormNotFoundError) {
              res.status(404).json({
                error: { code: "FORM_NOT_FOUND", message: "This form is not available." },
              });
              return;
            }
            if (error instanceof FormValidationError) {
              res.status(400).json({
                error: { code: "INVALID_SUBMISSION", message: error.message },
              });
              return;
            }
            next(error);
          });
      },
    );
  }

  // ---- Marketing compliance: no-login unsubscribe + double-opt-in confirm ----
  // Token-processing pages are neutral (no lead/tenant/campaign/CRM data),
  // carry anti-leak headers, load no third-party assets, and use the hardened
  // fragment→POST exchange so the token never reaches an access log, browser
  // history, Referer, analytics, or cache.
  if (deps.unsubscribe || deps.doubleOptIn) {
    const marketingHeaders = (res: Response): void => {
      res.set("Referrer-Policy", "no-referrer");
      res.set("Cache-Control", "no-store, private, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("X-Content-Type-Options", "nosniff");
    };
    // A minimal, self-contained neutral exchange page. `kind` selects the
    // fragment key (u = unsubscribe, c = confirm) and POST endpoint.
    const exchangePage = (
      title: string,
      kind: "u" | "c",
      endpoint: string,
      loadingMsg: string,
    ): string => {
      const okMsg =
        kind === "u"
          ? "You have been unsubscribed. You will no longer receive these marketing emails."
          : "Thank you — your subscription is confirmed.";
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive"/>
<meta name="referrer" content="no-referrer"/>
<title>${title}</title>
<style>body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:34rem;margin:12vh auto;padding:0 20px;color:#14181f}h1{font-size:1.4rem}.m{color:#5b6472}</style>
</head><body><h1>${title}</h1><p class="m" id="m">${loadingMsg}</p>
<noscript><p class="m">JavaScript is required. Paste the code from your email:</p>
<form method="post" action="${endpoint}"><input name="code" autocomplete="off"/><button>Submit</button></form></noscript>
<script>
(function(){var m=document.getElementById('m');
var h=(location.hash||'').match(/^#${kind}=([A-Za-z0-9]+)$/);
try{history.replaceState(null,'',location.pathname);}catch(e){}
if(!h){m.textContent='This link is missing its code. Please use the link from your email.';return;}
fetch('${endpoint}',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Privacy-Exchange':'1'},body:JSON.stringify({token:h[1]})})
.then(function(r){return r.json().catch(function(){return{};});})
.then(function(d){m.textContent=(d&&d.ok)?${JSON.stringify(okMsg)}:'This link is not valid or has expired.';})
.catch(function(){m.textContent='Something went wrong. Please try again in a moment.';});})();
</script></body></html>`;
    };
    const isForm = (req: Request): boolean =>
      /application\/x-www-form-urlencoded/.test(
        String(req.headers["content-type"] ?? ""),
      );
    const bodyToken = (req: Request): string => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return typeof b.token === "string"
        ? b.token
        : typeof b.code === "string"
          ? b.code.trim()
          : "";
    };

    if (deps.unsubscribe) {
      const unsub = deps.unsubscribe;
      // Human-facing unsubscribe (fragment-exchange). GET has NO side effect
      // (safe for email/security scanners); the POST performs the suppression.
      app.get("/unsubscribe", (_req, res) => {
        marketingHeaders(res);
        res
          .type("html")
          .send(
            exchangePage(
              "Unsubscribe",
              "u",
              "/unsubscribe",
              "Processing your request…",
            ),
          );
      });
      app.post(
        "/unsubscribe",
        express.urlencoded({ extended: false }),
        csrfGuard,
        (req, res) => {
          marketingHeaders(res);
          unsub
            .unsubscribe(bodyToken(req))
            .then((ok) => {
              // Generic either way — never reveal whether the token existed.
              if (isForm(req)) {
                res.type("html").send(
                  exchangePage(
                    "Unsubscribe",
                    "u",
                    "/unsubscribe",
                    ok ? "You have been unsubscribed." : "Request processed.",
                  ),
                );
                return;
              }
              res.json({ ok: true });
            })
            .catch(() => res.json({ ok: true }));
        },
      );

      // RFC 8058 one-click. The mail provider POSTs (List-Unsubscribe-Post).
      // A GET must NOT unsubscribe — it serves a neutral page only. The token
      // is opaque, single-purpose, hash-only at rest, and cannot read data or
      // resubscribe; it necessarily appears in the provider's server-side
      // request path (documented in docs/20).
      app.get("/api/unsubscribe/one-click/:token", (_req, res) => {
        marketingHeaders(res);
        res
          .type("html")
          .send(
            exchangePage(
              "Unsubscribe",
              "u",
              "/unsubscribe",
              "To unsubscribe, use the link in your email.",
            ),
          );
      });
      app.post(
        "/api/unsubscribe/one-click/:token",
        express.urlencoded({ extended: false }),
        (req, res) => {
          marketingHeaders(res);
          unsub
            .unsubscribe(String(req.params.token))
            .then(() => res.status(200).json({ ok: true }))
            .catch(() => res.status(200).json({ ok: true }));
        },
      );
    }

    if (deps.doubleOptIn) {
      const dbl = deps.doubleOptIn;
      app.get("/marketing/confirm", (_req, res) => {
        marketingHeaders(res);
        res
          .type("html")
          .send(
            exchangePage(
              "Confirm subscription",
              "c",
              "/marketing/confirm",
              "Confirming your subscription…",
            ),
          );
      });
      app.post(
        "/marketing/confirm",
        express.urlencoded({ extended: false }),
        csrfGuard,
        (req, res) => {
          marketingHeaders(res);
          dbl
            .confirm(bodyToken(req))
            .then(async (outcome) => {
              if (outcome.ok) {
                // Record confirmed consent (immutable) AND bind the marketing
                // activation (awaiting→ready) to the EXACT terms accepted, all
                // in the token's tenant scope. Email verification confirms
                // control of the address, not full identity. The enrollment
                // itself is done later by the activation worker, which rechecks
                // every gate — this only flips the intent to ready.
                await runWithTenant(
                  { organizationId: outcome.organizationId },
                  async () => {
                    const latest = deps.marketingConsent
                      ? await deps.marketingConsent.latestForEmail(outcome.email)
                      : undefined;
                    if (
                      deps.marketingConsent &&
                      latest &&
                      !latest.confirmedAt
                    ) {
                      await deps.marketingConsent.confirm(latest.id);
                    }
                    if (deps.marketingActivations && latest) {
                      // Bound by (org, formId, email, version) — a token can
                      // only ready the activation whose exact terms it carries.
                      await deps.marketingActivations.confirm(
                        outcome.organizationId,
                        outcome.email,
                        latest.version,
                        latest.formId,
                      );
                    }
                  },
                ).catch(() => undefined);
              }
              if (isForm(req)) {
                res.type("html").send(
                  exchangePage(
                    "Confirm subscription",
                    "c",
                    "/marketing/confirm",
                    outcome.ok
                      ? "Your subscription is confirmed."
                      : "This link is not valid or has expired.",
                  ),
                );
                return;
              }
              res.json({ ok: outcome.ok });
            })
            .catch(() => res.json({ ok: false }));
        },
      );
    }
  }

  // ---- Account-email verification + labeled marketing-sender test ----
  // Two capabilities kept STRICTLY separate, and NEITHER is ever counted as a
  // marketing send:
  //   1. Account-email verification proves a user controls their account email.
  //      It uses the PLATFORM transactional sender on an AEC-controlled host and
  //      NEVER touches tenant marketing-sender config, consent, suppression, or
  //      the unsubscribe system. Its link carries no marketing headers.
  //   2. The marketing-sender TEST uses the tenant's RESOLVED+APPROVED marketing
  //      sender identity, but is a one-off transactional probe to the requester's
  //      OWN verified address — no lead, consent, activation, enrollment,
  //      suppression, sequence, outbox, or metering side effect, and no real
  //      unsubscribe token / one-click header.
  if (deps.emailVerification) {
    const verifier = deps.emailVerification;

    // The verification link ALWAYS lives on the trusted platform host, never a
    // tenant host. secureCookie gates http vs https so local dev still works.
    const platformHost = (deps.baseDomain ?? "allelitecloud.com").toLowerCase();
    const platformProto = deps.secureCookie ? "https" : "http";

    // Anti-leak, non-indexable, un-embeddable headers for the neutral exchange
    // page. The restrictive CSP allows only same-origin form/fetch and the
    // page's own inline style+script; no third-party scripts, fonts, images,
    // frames, or analytics can load.
    const verifyHeaders = (res: Response): void => {
      res.set("Referrer-Policy", "no-referrer");
      res.set("Cache-Control", "no-store, private, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("X-Content-Type-Options", "nosniff");
      res.set("X-Frame-Options", "DENY");
      res.set(
        "Content-Security-Policy",
        [
          "default-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "connect-src 'self'",
          "style-src 'unsafe-inline'",
          "script-src 'unsafe-inline'",
        ].join("; "),
      );
    };

    // Neutral, self-contained page: reads the token from the URL FRAGMENT
    // (never sent to the server / logs / Referer), strips it from history
    // BEFORE doing anything else, then POSTs it. Accessible (labelled control,
    // visible focus, reduced-motion respected), mobile-friendly, no 3rd-party
    // assets. Messages are generic — they never reveal whether an account or
    // token exists.
    const verifyPage = (settled?: boolean): string => {
      const loading = settled
        ? "Request processed."
        : "Confirming your email address…";
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive"/>
<meta name="referrer" content="no-referrer"/>
<title>Verify email</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:34rem;margin:12vh auto;padding:0 20px;color:#14181f;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e8ecf2;background:#14181f}.m{color:#9aa4b2}}
h1{font-size:1.4rem}.m{color:#5b6472}
a,button,input{font:inherit}
button{padding:.55rem 1rem;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head><body>
<h1>Verify your email</h1>
<p class="m" id="m" role="status" aria-live="polite">${loading}</p>
<noscript><p class="m">JavaScript is required to complete verification, or paste the code from your email:</p>
<form method="post" action="/verify-email"><label for="c">Code</label>
<input id="c" name="code" autocomplete="off" autocapitalize="off" spellcheck="false"/>
<button>Verify</button></form></noscript>
<script>
(function(){var m=document.getElementById('m');
var h=(location.hash||'').match(/^#v=([A-Za-z0-9]+)$/);
try{history.replaceState(null,'',location.pathname);}catch(e){}
if(!h){m.textContent='This link is missing its code. Please use the link from your email.';return;}
fetch('/verify-email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Privacy-Exchange':'1'},body:JSON.stringify({token:h[1]})})
.then(function(r){return r.json().catch(function(){return{};});})
.then(function(d){m.textContent=(d&&d.ok)?'Your email address is verified. You can close this page.':'This link is invalid, has expired, or was already used.';})
.catch(function(){m.textContent='Something went wrong. Please try again in a moment.';});})();
</script></body></html>`;
    };

    const isFormPost = (req: Request): boolean =>
      /application\/x-www-form-urlencoded/.test(
        String(req.headers["content-type"] ?? ""),
      );
    const readToken = (req: Request): string => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      if (typeof b.token === "string") return b.token;
      if (typeof b.code === "string") return b.code.trim();
      return "";
    };

    // Per-user, per-email-hash, per-IP, and platform-wide caps on how often a
    // verification email can be requested. Keyed limiters use req.ip (trusted
    // single proxy hop); the platform cap uses a constant key.
    const perUserVerify = new RateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
    const perIpVerify = new RateLimiter({ max: 15, windowMs: 60 * 60 * 1000 });
    const platformVerify = new RateLimiter({ max: 500, windowMs: 60 * 60 * 1000 });
    const emailHash = (email: string): string =>
      createHmac("sha256", platformHost).update(email.toLowerCase()).digest("hex");
    const platformWide = (
      limiter: RateLimiter,
      scope: string,
    ): express.RequestHandler => {
      return (_req, res, next) => {
        const r = limiter.hit(scope);
        if (!r.allowed) {
          res.setHeader("Retry-After", String(Math.ceil(r.retryAfterMs / 1000)));
          res.status(429).json({
            error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
          });
          return;
        }
        next();
      };
    };

    // (1) Request an account-verification email. Authenticated + CSRF. The
    // recipient is the caller's OWN account email, selected server-side; the
    // request body takes NO parameters (a recipient/redirect override is a 400).
    // The response is generic and identical whether or not an email was sent, so
    // it can't be used to probe accounts. Transactional only — no unsubscribe
    // headers. An uncertain/failed SMTP attempt is NOT auto-resent.
    app.post(
      "/api/platform/account/request-verification",
      csrfGuard,
      requireUser,
      rateLimit({
        limiter: perUserVerify,
        scope: "verify-req-user",
        keyPart: (req) => (req as AuthedRequest).auth!.user.id,
      }),
      rateLimit({
        limiter: perIpVerify,
        scope: "verify-req-ip",
      }),
      platformWide(platformVerify, "verify-req-platform"),
      (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (Object.keys(body).length > 0) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "This request takes no parameters.",
            },
          });
          return;
        }
        const auth = (req as AuthedRequest).auth!;
        const userId = auth.user.id;
        const generic = (): void => {
          res.json({ ok: true });
        };
        // Fail closed: with no configured+authenticated transactional sender we
        // do NOT fabricate a `no-reply@…` address — we simply send nothing (the
        // reply is still generic). The configured From is never echoed publicly.
        const txSender = deps.transactionalSender;
        verifier
          .request(userId)
          .then(async (minted) => {
            if (!minted || !deps.emailProvider || !txSender) {
              generic();
              return;
            }
            // Per-email-hash cap (defense against a single mailbox being hit).
            const eh = perUserVerify.hit(`email:${emailHash(minted.email)}`);
            if (!eh.allowed) {
              generic();
              return;
            }
            const link = `${platformProto}://${platformHost}/verify-email#v=${minted.token}`;
            // Message-ID domain follows the configured sender's own domain (its
            // authenticated identity), not the web host.
            const senderDomain =
              /@([^>\s]+)/.exec(txSender.from)?.[1]?.toLowerCase() ??
              platformHost;
            try {
              await deps.emailProvider.deliver({
                to: minted.email,
                from: txSender.from,
                subject: "Verify your All Elite Cloud email address",
                text:
                  "Confirm your email to finish securing your All Elite Cloud account.\n\n" +
                  "Open this link to verify this address:\n" +
                  link +
                  "\n\nThis link can be used once and expires in 24 hours. " +
                  "If you did not request this, you can ignore this email — no changes have been made.",
                messageClass: "transactional",
                logicalId: `account-verify:${userId}`,
                attemptId: randomBytes(12).toString("hex"),
                sendingDomain: senderDomain,
              });
              // We deliberately do NOT branch on the classification: the reply
              // is generic, and an uncertain/failed attempt is never auto-resent
              // here (the user can request again, rate-limited).
            } catch {
              // Swallow — never leak transport state to the caller.
            }
            generic();
          })
          .catch(() => generic());
      },
    );

    // (2a) Neutral fragment-exchange confirmation page (public). GET has NO
    // side effect — safe for email/security scanners to prefetch.
    app.get("/verify-email", (_req, res) => {
      verifyHeaders(res);
      res.type("html").send(verifyPage());
    });
    // (2b) Confirm the token (public, CSRF-guarded). Generic result either way —
    // never reveals whether the account/token existed. No auth: the token IS
    // the proof, and confirmation happens with no tenant session.
    app.post(
      "/verify-email",
      express.urlencoded({ extended: false }),
      csrfGuard,
      (req, res) => {
        verifyHeaders(res);
        verifier
          .confirm(readToken(req))
          .then((outcome) => {
            if (isFormPost(req)) {
              res.type("html").send(verifyPage(true));
              return;
            }
            res.json({ ok: outcome.ok });
          })
          .catch(() => res.json({ ok: false }));
      },
    );

    // (3) Send a labeled TEST email using the tenant's marketing sender.
    // Owner/admin only (members are denied even if verified) AND the caller's
    // account email must be verified (fail-closed). Recipient is the caller's
    // own verified address, selected server-side; a recipient override is a 400.
    // Uses the tenant's resolved+approved marketing sender identity but is a
    // transactional probe: no marketing headers, no unsubscribe token, and NO
    // lead/consent/activation/enrollment/suppression/sequence/outbox/metering
    // side effects. Returns only an honest, sanitized classification.
    if (deps.marketingSender && deps.emailProvider) {
      const senderSvc = deps.marketingSender;
      const provider = deps.emailProvider;
      const perUserTest = new RateLimiter({ max: 6, windowMs: 60 * 60 * 1000 });
      const perIpTest = new RateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
      const platformTest = new RateLimiter({ max: 300, windowMs: 60 * 60 * 1000 });

      app.post(
        "/api/platform/marketing/test-email",
        csrfGuard,
        requireUser,
        requireRole("owner", "admin"),
        rateLimit({
          limiter: perUserTest,
          scope: "test-email-user",
          keyPart: (req) => (req as AuthedRequest).auth!.user.id,
        }),
        rateLimit({ limiter: perIpTest, scope: "test-email-ip" }),
        platformWide(platformTest, "test-email-platform"),
        (req, res) => {
          const body = (req.body ?? {}) as Record<string, unknown>;
          if (Object.keys(body).length > 0) {
            res.status(400).json({
              error: {
                code: "INVALID_REQUEST",
                message: "This request takes no parameters; the test is sent to your own account email.",
              },
            });
            return;
          }
          const auth = (req as AuthedRequest).auth!;
          const userId = auth.user.id;
          const recipient = auth.user.email;
          void (async () => {
            // Fail-closed: an unverified owner/admin cannot send a test.
            if (!(await verifier.isVerified(userId))) {
              res.status(403).json({
                error: {
                  code: "EMAIL_UNVERIFIED",
                  message: "Verify your account email before sending a test.",
                },
              });
              return;
            }
            // Resolve the tenant's marketing sender identity (fail-closed with a
            // compliance action item; this is a pre-acceptance failure — it
            // never reaches SMTP).
            const resolution = await senderSvc.resolve();
            if (!resolution.ok) {
              res.status(200).json({
                status: "pre_acceptance_failure",
                configIssue: resolution.reason,
                message:
                  "Your marketing sender isn’t ready yet. Complete your sender details, then try again.",
              });
              return;
            }
            const sender = resolution.sender;
            const result = await provider.deliver({
              to: recipient,
              from: `${sender.fromName} <${sender.fromAddress}>`,
              replyTo: sender.replyTo,
              subject: "[Test] Your All Elite Cloud marketing sender",
              text:
                "This is a TEST message from All Elite Cloud.\n\n" +
                "It checks that your marketing sender configuration can send email. " +
                "It was sent only to your own verified account address, is not part of " +
                "any campaign, and no contacts received it.\n\n" +
                "If the From and Reply-To look right and this arrives in your inbox, " +
                "your marketing sender is working. This message has no unsubscribe link " +
                "because it is a test, not a marketing email.",
              // Transactional: this probe must NEVER be metered as a marketing
              // send and carries no List-Unsubscribe / one-click headers.
              messageClass: "transactional",
              logicalId: `sender-test:${userId}`,
              attemptId: randomBytes(12).toString("hex"),
              sendingDomain: platformHost,
            });
            // Honest, sanitized status only — never the raw SMTP response,
            // recipient address, body, credentials, or internal detail. The
            // coarse category (e.g. "auth"/"connection"/"tls") is a safe
            // owner-actionable hint produced by the provider.
            const message =
              result.classification === "accepted"
                ? "Your sender accepted the test for delivery. Check your inbox (and spam) to confirm it arrives — acceptance isn’t proof of inbox placement."
                : result.classification === "rejected"
                  ? "The mail server rejected the test. Check your sender address and domain settings."
                  : result.classification === "pre_acceptance_failure"
                    ? "The test couldn’t be sent. This usually means a connection, TLS, or authentication issue with the mail server."
                    : "The result was uncertain — the test may or may not have gone out. Wait a moment before trying again.";
            res.status(200).json({
              status: result.classification,
              category: result.responseCategory,
              usingPlatformFallback: sender.usingPlatformFallback,
              message,
            });
          })().catch(() => {
            res.status(200).json({
              status: "uncertain",
              message: "The result was uncertain. Please try again in a moment.",
            });
          });
        },
      );
    }
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
      legal: deps.legal,
      privacy: deps.privacy,
      platformAudit: deps.platformAudit,
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
      legalAcceptance: deps.legalAcceptance,
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

  // Tenant Legal & Compliance workspace API (authenticated; reads open to
  // members, writes owner/admin). Mounted before the general tenant API so its
  // /legal-workspace/* paths match; other paths fall through.
  if (deps.tenantLegal) {
    app.use(
      "/api/platform",
      csrfGuard,
      createTenantLegalRouter({
        legal: deps.tenantLegal,
        requireUser,
        audit: deps.audit,
      }),
    );
  }

  // Marketing operations (owner/admin): pause/resume/cancel + delivery-unknown
  // review. Mounted before the general tenant API so its /marketing/* paths win.
  if (deps.marketingOutbox || deps.marketingPause) {
    app.use(
      "/api/platform",
      csrfGuard,
      createMarketingOpsRouter({
        requireUser,
        outbox: deps.marketingOutbox,
        confirmationDispatch: deps.confirmationDispatch,
        pause: deps.marketingPause,
        drip: deps.drip,
      }),
    );
  }

  // Lead-magnet owner/admin config + inspection (owner/admin only).
  if (deps.magnetDispatch || deps.magnetFulfillment) {
    app.use(
      "/api/platform",
      csrfGuard,
      createMagnetOpsRouter({
        requireUser,
        dispatch: deps.magnetDispatch,
        fulfillment: deps.magnetFulfillment,
        files: deps.files,
        transactionalConfigured: Boolean(deps.transactionalSenderConfigured),
      }),
    );
  }

  // Tenant Privacy Requests management API (owner/admin; members denied). The
  // tenant organization comes from the authenticated session, never client
  // input. Mounted before the general tenant API so its paths match. Privacy
  // requests are LEGALLY + TECHNICALLY separate from marketing consent.
  if (deps.privacy) {
    app.use(
      "/api/platform",
      csrfGuard,
      createPrivacyManagementRouter({
        privacy: deps.privacy,
        requireUser,
        audit: deps.audit,
        email: deps.email,
      }),
    );
  }

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

  // Public, capability-gated lead-magnet download (GET/POST /magnet, GET
  // /magnet/file). No auth: the capability + one-time session ARE the proof.
  if (deps.magnetCapabilities && deps.magnetSessions && deps.files) {
    app.use(
      createLeadMagnetDownloadRouter({
        capabilities: deps.magnetCapabilities,
        sessions: deps.magnetSessions,
        files: deps.files,
        secureCookie: deps.secureCookie,
      }),
    );
  }

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
/**
 * Resolves the tenant that owns a public host: a verified custom domain first,
 * then a subdomain label under the platform base domain. Returns the
 * organization id + display name, or null on the apex/unknown host. Used to
 * serve a tenant's own published legal pages without ever crossing tenants.
 */
async function resolveTenantByHost(
  host: string | undefined,
  deps: PlatformAppDependencies,
): Promise<{ organizationId: string; orgName: string } | null> {
  if (!host) {
    return null;
  }
  const domain = normalizeDomain(host);
  if (!domain) {
    return null;
  }
  // 1) Verified custom domain.
  if (deps.domains) {
    const orgId = await deps.domains
      .resolve(host)
      .catch(() => undefined);
    if (orgId) {
      const org = await deps.organizations
        .get(orgId)
        .catch(() => undefined);
      return {
        organizationId: orgId,
        orgName: org?.name ?? "",
      };
    }
  }
  // 2) Subdomain slug under the platform base domain.
  const base = deps.baseDomain
    ? deps.baseDomain.toLowerCase()
    : undefined;
  if (base && domain !== base && domain.endsWith(`.${base}`)) {
    const label = domain
      .slice(0, domain.length - base.length - 1)
      .split(".")
      .pop();
    if (
      label &&
      !["www", "app", "staging", "portal"].includes(label)
    ) {
      const org = await deps.organizations
        .getBySlug(label)
        .catch(() => undefined);
      if (org && org.status === "active") {
        return { organizationId: org.id, orgName: org.name };
      }
    }
  }
  return null;
}

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
