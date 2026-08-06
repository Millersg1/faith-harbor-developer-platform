import { join } from "node:path";

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
import {
  RateLimiter,
  rateLimit,
} from "./security/RateLimiter";
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

  // Tenant Privacy Requests management API (owner/admin; members denied). The
  // tenant organization comes from the authenticated session, never client
  // input. Mounted before the general tenant API so its paths match.
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
