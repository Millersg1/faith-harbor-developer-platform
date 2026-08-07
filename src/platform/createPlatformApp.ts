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
import { RateLimiter } from "./security/RateLimiter";
import type { UnsubscribeService } from "./marketing/EmailSuppressionService";
import type { DoubleOptInService } from "./marketing/DoubleOptInService";
import type { MarketingConsentService } from "./marketing/MarketingConsentService";
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
            // HOST-BINDING (fail-closed): if the request host resolves to a
            // tenant (subdomain / verified custom domain), it MUST be the form's
            // owner. A cross-tenant host + slug is refused with the SAME generic
            // 404 as an unknown slug (no tenant/form existence leak). Client-
            // supplied org id / host / redirect are ignored — only the trusted
            // host resolver + the form's own org are used.
            const resolved = await resolveTenantByHost(
              req.headers.host,
              deps,
            ).catch(() => null);
            if (resolved && resolved.organizationId !== form.organizationId) {
              (req as PublicFormReq).publicForm = undefined;
              res.status(404).json({
                error: {
                  code: "FORM_NOT_FOUND",
                  message: "This form is not available.",
                },
              });
              return;
            }
            // Build links from the form OWNER's trusted canonical host (its
            // subdomain), never the incoming request host / apex / another
            // tenant.
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

        forms
          .submitPublic(String(req.params.slug), data, attribution)
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
                // Record confirmed consent (immutable) in the token's tenant
                // scope. Email verification confirms control of the address,
                // not full identity.
                if (deps.marketingConsent) {
                  await runWithTenant(
                    { organizationId: outcome.organizationId },
                    async () => {
                      const latest =
                        await deps.marketingConsent!.latestForEmail(
                          outcome.email,
                        );
                      if (latest && !latest.confirmedAt) {
                        await deps.marketingConsent!.confirm(latest.id);
                      }
                    },
                  ).catch(() => undefined);
                }
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
