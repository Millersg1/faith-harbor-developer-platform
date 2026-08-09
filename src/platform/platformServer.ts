import "dotenv/config";

import { PostgresDatabase } from "../persistence/PostgresDatabase";
import { OrganizationRepository } from "../tenancy/OrganizationRepository";
import { runWithTenant } from "../tenancy/TenantContext";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainRepository } from "../tenancy/OrganizationDomainRepository";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminRepository } from "./admin/PlatformAdminRepository";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAnalyticsService } from "./analytics/PlatformAnalyticsService";
import { PlatformHealthService } from "./health/PlatformHealthService";
import { OnboardingService } from "./onboarding/OnboardingService";
import { WorkspacePreferencesService } from "./preferences/WorkspacePreferencesService";
import { WorkspacePreferencesRepository } from "./preferences/WorkspacePreferencesRepository";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { AiUsageRepository } from "./ai/AiUsageRepository";
import { OrganizationAiSettingsRepository } from "./ai/OrganizationAiSettingsRepository";
import { OrganizationAiSettingsService } from "./ai/OrganizationAiSettingsService";
import { BillingService } from "./billing/BillingService";
import { SubscriptionRepository } from "./billing/SubscriptionRepository";
import { ProcessedEventsRepository } from "./billing/ProcessedEventsRepository";
import {
  DisconnectedStripeSubscriptionGateway,
  HttpStripeSubscriptionGateway,
  type StripeSubscriptionGateway,
} from "./billing/StripeSubscriptionGateway";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformBrandRepository } from "./brands/PlatformBrandRepository";
import { PlatformBrandService } from "./brands/PlatformBrandService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformLeadRepository } from "./crm/PlatformLeadRepository";
import { PlatformLeadService } from "./crm/PlatformLeadService";
import { PlatformCampaignRepository } from "./marketing/PlatformCampaignRepository";
import { PlatformCampaignService } from "./marketing/PlatformCampaignService";
import {
  LoggingEmailTransport,
  type EmailTransport,
} from "../communications/EmailTransport";
import { SmtpEmailTransport } from "../communications/SmtpEmailTransport";
import { PlatformEmailRepository } from "./email/PlatformEmailRepository";
import { PlatformEmailService } from "./email/PlatformEmailService";
import { SmtpEmailDeliveryProvider } from "./email/SmtpEmailDeliveryProvider";
import {
  EmailVerificationService,
  EmailVerificationTokenRepository,
} from "./auth/EmailVerificationService";
import { PlatformUserVerificationStore } from "./auth/PlatformUserVerificationStore";
import {
  MarketingSenderService,
  MarketingSenderRepository,
} from "./marketing/MarketingSenderService";
import { ClientUserRepository } from "./portal/ClientUserRepository";
import { ClientUserService } from "./portal/ClientUserService";
import { PortalSessionRepository } from "./portal/PortalSessionRepository";
import { PortalSessionService } from "./portal/PortalSessionService";
import { PlatformProductRepository } from "./products/PlatformProductRepository";
import { PlatformProductService } from "./products/PlatformProductService";
import { PlatformProgramRepository } from "./programs/PlatformProgramRepository";
import { PlatformProgramService } from "./programs/PlatformProgramService";
import { PlatformProposalRepository } from "./proposals/PlatformProposalRepository";
import { PlatformProposalService } from "./proposals/PlatformProposalService";
import { PlatformBookRepository } from "./publishing/PlatformBookRepository";
import { PlatformBookService } from "./publishing/PlatformBookService";
import { PlatformReviewRepository } from "./reviews/PlatformReviewRepository";
import { PlatformReviewService } from "./reviews/PlatformReviewService";
import { PlatformHostingRepository } from "./hosting/PlatformHostingRepository";
import { PlatformHostingService } from "./hosting/PlatformHostingService";
import { PlatformTicketRepository } from "./support/PlatformTicketRepository";
import { PlatformTicketService } from "./support/PlatformTicketService";
import { PlatformWebsiteRepository } from "./websites/PlatformWebsiteRepository";
import { WebsiteGenerationLockRepository } from "./websites/WebsiteGenerationLockRepository";
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import {
  DisconnectedWebsiteGenerator,
  OpenAiWebsiteGenerator,
  type WebsiteGenerator,
} from "./websites/WebsiteGenerator";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PasswordResetService } from "./auth/PasswordResetService";
import { PasswordResetRepository } from "./auth/PasswordResetRepository";
import { DripService } from "./drip/DripService";
import { DripRepository } from "./drip/DripRepository";
import { ActivityService } from "./events/ActivityService";
import { ActivityEventRepository } from "./events/ActivityEventRepository";
import { NotificationService } from "./notifications/NotificationService";
import { NotificationRepository } from "./notifications/NotificationRepository";
import { createNotificationActivityHandler } from "./notifications/NotificationActivityHandler";
import { SearchService } from "./search/SearchService";
import { PlatformFileService } from "./files/PlatformFileService";
import { PlatformFileRepository } from "./files/PlatformFileRepository";
import { LocalStorageProvider } from "./files/StorageProvider";
import { PlatformFormService } from "./forms/PlatformFormService";
import {
  MarketingConsentService,
  MarketingConsentRepository,
} from "./marketing/MarketingConsentService";
import {
  EmailSuppressionService,
  EmailSuppressionRepository,
  UnsubscribeService,
  UnsubscribeTokenRepository,
} from "./marketing/EmailSuppressionService";
import {
  DoubleOptInService,
  DoubleOptInTokenRepository,
} from "./marketing/DoubleOptInService";
import {
  MarketingActivationService,
  MarketingActivationRepository,
} from "./marketing/MarketingActivationService";
import {
  ConfirmationDispatchService,
  ConfirmationDispatchRepository,
} from "./marketing/ConfirmationDispatchService";
import {
  MarketingOutboxService,
  MarketingOutboxRepository,
} from "./marketing/MarketingOutboxService";
import {
  MarketingLimitsService,
  MarketingMeterRepository,
} from "./marketing/MarketingLimitsService";
import {
  MarketingPauseService,
  MarketingPauseRepository,
} from "./marketing/MarketingPauseService";
import { MarketingWorker } from "./marketing/MarketingWorker";
import {
  resolveMarketingDeliveryMode,
  describeDeliveryMode,
} from "./marketing/marketingDeliveryMode";
import {
  createMarketingEligibility,
  createMarketingSend,
} from "./marketing/marketingSendComposition";
import { createConfirmationSend } from "./marketing/ConfirmationDispatchService";
import { createActivationGates } from "./marketing/marketingActivationGates";
import { PlatformFormRepository } from "./forms/PlatformFormRepository";
import { CalendarService } from "./calendar/CalendarService";
import { CalendarEventRepository } from "./calendar/CalendarEventRepository";
import { KnowledgeService } from "./knowledge/KnowledgeService";
import { KnowledgeRepository } from "./knowledge/KnowledgeRepository";
import { AuditService } from "./audit/AuditService";
import { AuditRepository } from "./audit/AuditRepository";
import { PlatformLegalService } from "./legal/PlatformLegalService";
import { PlatformLegalDocumentRepository } from "./legal/PlatformLegalDocumentRepository";
import { LegalAcceptanceService } from "./legal/LegalAcceptanceService";
import { LegalAcceptanceRepository } from "./legal/LegalAcceptanceRepository";
import { RetentionService } from "./legal/RetentionService";
import { platformLegalSeeds } from "./legal/content/platformLegalContent";
import { TenantLegalService } from "./tenantlegal/TenantLegalService";
import { TenantLegalDocumentRepository } from "./tenantlegal/TenantLegalDocumentRepository";
import { TenantQuestionnaireRepository } from "./tenantlegal/TenantQuestionnaireRepository";
import { WorkflowService } from "./workflows/WorkflowService";
import { WorkflowRepository } from "./workflows/WorkflowRepository";
import { AiToolRegistry } from "./ai/tools/AiToolRegistry";
import { AiToolService } from "./ai/tools/AiToolService";
import { AiToolInvocationRepository } from "./ai/tools/AiToolInvocationRepository";
import { buildDefaultAiTools } from "./ai/tools/defaultAiTools";
import { AiConsoleService } from "./ai/console/AiConsoleService";
import { AiEmployeeService } from "./ai/employees/AiEmployeeService";
import { AiConversationService } from "./ai/conversations/AiConversationService";
import { AiConversationRepository } from "./ai/conversations/AiConversationRepository";
import { AiEmployeeRepository } from "./ai/employees/AiEmployeeRepository";
import {
  createChatClient,
  DisconnectedChatClient,
  OpenAiChatClient,
  type ChatClient,
} from "./ai/console/ChatClient";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

/**
 * Boots the All Elite Cloud platform against Postgres and starts serving.
 *
 * Runs as its own process, separate from the legacy Faith Harbor OS
 * server — so standing this up never touches production. It reads its
 * Postgres connection and settings from the environment.
 */
async function start(): Promise<void> {
  const user = process.env.PG_USER;
  const password =
    process.env.PG_PASSWORD;
  const database =
    process.env.PG_DATABASE;

  if (!user || !password || !database) {
    throw new Error(
      "The platform requires PG_USER, PG_PASSWORD and PG_DATABASE.",
    );
  }

  const db = new PostgresDatabase({
    host:
      process.env.PG_HOST ??
      "127.0.0.1",
    port: Number(
      process.env.PG_PORT ?? 5432,
    ),
    user,
    password,
    database,
  });

  await db.initialize();
  console.log(
    "All Elite Cloud schema ready.",
  );

  const organizations =
    new OrganizationService(
      new OrganizationRepository(db),
    );
  const users =
    new PlatformUserService(
      new PlatformUserRepository(db),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(
        db,
      ),
    );
  const branding =
    new BrandingService(
      new BrandingRepository(db),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(
        db,
      ),
    );
  const projects =
    new PlatformProjectService(
      new PlatformProjectRepository(
        db,
      ),
      clients,
    );
  const invoices =
    new PlatformInvoiceService(
      new PlatformInvoiceRepository(
        db,
      ),
      clients,
    );
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );
  const passwordReset =
    new PasswordResetService(
      new PasswordResetRepository(db),
      users,
    );
  const domains =
    new OrganizationDomainService(
      new OrganizationDomainRepository(
        db,
      ),
    );
  // Stripe subscription billing: live when a secret key is present in the
  // platform env, otherwise a disconnected stub (so the platform runs, and
  // free-plan changes still work, with no key).
  const stripeSecret =
    process.env.STRIPE_SECRET_KEY?.trim();
  const stripeGateway: StripeSubscriptionGateway =
    stripeSecret
      ? new HttpStripeSubscriptionGateway(
          {
            secretKey: stripeSecret,
            webhookSecret:
              process.env.STRIPE_WEBHOOK_SECRET?.trim(),
          },
        )
      : new DisconnectedStripeSubscriptionGateway();
  const billing =
    new BillingService(
      new SubscriptionRepository(db),
      stripeGateway,
      new ProcessedEventsRepository(db),
    );
  const hosting =
    new PlatformHostingService(
      new PlatformHostingRepository(
        db,
      ),
      clients,
    );
  const tickets =
    new PlatformTicketService(
      new PlatformTicketRepository(
        db,
      ),
      clients,
    );
  const leads =
    new PlatformLeadService(
      new PlatformLeadRepository(db),
      clients,
    );
  const proposals =
    new PlatformProposalService(
      new PlatformProposalRepository(
        db,
      ),
      clients,
    );
  const products =
    new PlatformProductService(
      new PlatformProductRepository(
        db,
      ),
      clients,
    );
  const books =
    new PlatformBookService(
      new PlatformBookRepository(db),
      clients,
    );
  const programs =
    new PlatformProgramService(
      new PlatformProgramRepository(
        db,
      ),
      clients,
    );
  // Email: a real SMTP transport when SMTP_* is configured (e.g. a cPanel
  // mailbox), otherwise a logging transport that records but doesn't deliver.
  const smtpHost =
    process.env.SMTP_HOST?.trim();
  const smtpUser =
    process.env.SMTP_USER?.trim();
  const smtpPass =
    process.env.SMTP_PASSWORD?.trim();
  const emailConnected = Boolean(
    smtpHost && smtpUser && smtpPass,
  );
  const emailTransport: EmailTransport =
    emailConnected
      ? new SmtpEmailTransport({
          host: smtpHost as string,
          port: Number(
            process.env.SMTP_PORT ??
              465,
          ),
          user: smtpUser as string,
          password:
            smtpPass as string,
        })
      : new LoggingEmailTransport();
  const transactionalFrom =
    process.env.SMTP_FROM?.trim() || undefined;
  const email =
    new PlatformEmailService(
      new PlatformEmailRepository(db),
      emailTransport,
      {
        connected: emailConnected,
        fromDefault: transactionalFrom,
      },
    );
  // The configured + authenticated transactional sender identity, reused for
  // account-verification email. "Approved" = an authenticated transport AND a
  // configured From. Absent → verification email fails closed (nothing sent);
  // we never invent a `no-reply@<domain>` address.
  const transactionalSender =
    emailConnected && transactionalFrom
      ? { from: transactionalFrom }
      : undefined;
  // Marketing compliance core (S6): suppression, unsubscribe tokens, double
  // opt-in. Constructed before drip so the worker can recheck suppression
  // immediately before every send.
  const suppression = new EmailSuppressionService(
    new EmailSuppressionRepository(db),
  );
  const unsubscribe = new UnsubscribeService(
    new UnsubscribeTokenRepository(db),
    suppression,
  );
  const doubleOptIn = new DoubleOptInService(
    new DoubleOptInTokenRepository(db),
  );
  // Provider-independent delivery over the existing SMTP transport (honest
  // accepted/rejected/pre_acceptance_failure/uncertain classification). Used by
  // account verification (platform sender) and the marketing-sender test.
  const emailProvider = new SmtpEmailDeliveryProvider(emailTransport);
  // Account-email verification (platform transactional; separate from all
  // marketing systems). Its store uses a dedicated repo instance because
  // confirmation happens with no tenant session.
  const emailVerification = new EmailVerificationService(
    new PlatformUserVerificationStore(new PlatformUserRepository(db)),
    new EmailVerificationTokenRepository(db),
  );
  // Per-tenant marketing sender identity resolution (for the labeled test).
  const marketingSender = new MarketingSenderService(
    new MarketingSenderRepository(db),
  );
  // The ONE authoritative marketing delivery mode. Legacy drip direct-send and
  // the safeguarded outbox both consult this, so they can never both deliver.
  const deliveryMode = resolveMarketingDeliveryMode(
    process.env.MARKETING_DELIVERY_MODE,
  );
  const marketingMode = () => deliveryMode.mode;
  const drip = new DripService(
    new DripRepository(db),
    email,
    { suppression, marketingMode },
  );
  // Activity spine + notifications. Recording an event fans out to the
  // notification dispatcher, which notifies the org's active owners/admins.
  const notifications =
    new NotificationService(
      new NotificationRepository(db),
    );
  const activity = new ActivityService(
    new ActivityEventRepository(db),
  );
  activity.subscribe(
    createNotificationActivityHandler({
      notifications,
      resolveRecipients: () =>
        users
          .list()
          .then((list) =>
            list
              .filter(
                (u) =>
                  u.status ===
                    "active" &&
                  (u.role === "owner" ||
                    u.role ===
                      "admin"),
              )
              .map((u) => u.id),
          )
          .catch(() => []),
    }),
  );
  const clientUsers =
    new ClientUserService(
      new ClientUserRepository(db),
      clients,
    );
  const portalSessions =
    new PortalSessionService(
      new PortalSessionRepository(db),
    );
  const campaigns =
    new PlatformCampaignService(
      new PlatformCampaignRepository(
        db,
      ),
      clients,
    );
  const reviews =
    new PlatformReviewService(
      new PlatformReviewRepository(
        db,
      ),
      clients,
    );
  const brands =
    new PlatformBrandService(
      new PlatformBrandRepository(db),
    );

  // The website builder's AI generator: live when an OpenAI key is present
  // in the platform env, otherwise a disconnected stub that reports "not
  // configured" (so the platform runs fine keyless).
  const openAiKey =
    process.env.OPENAI_API_KEY?.trim();
  const websiteGenerator: WebsiteGenerator =
    openAiKey
      ? new OpenAiWebsiteGenerator({
          apiKey: openAiKey,
          model:
            process.env
              .OPENAI_MODEL ||
            undefined,
        })
      : new DisconnectedWebsiteGenerator();
  const aiSettings =
    new OrganizationAiSettingsService(
      new OrganizationAiSettingsRepository(
        db,
      ),
    );
  const aiUsage =
    new AiUsageRepository(db);
  const websites =
    new PlatformWebsiteService(
      new PlatformWebsiteRepository(
        db,
      ),
      websiteGenerator,
      clients,
      aiSettings,
      aiUsage,
      billing,
      undefined,
      new WebsiteGenerationLockRepository(
        db,
      ),
    );

  const admins =
    new PlatformAdminService(
      new PlatformAdminRepository(db),
    );
  const adminSessions =
    new PlatformAdminSessionService(
      db,
    );
  // Cross-tenant business analytics for the superadmin console.
  const platformAnalytics =
    new PlatformAnalyticsService(
      organizations,
      new SubscriptionRepository(db),
      aiUsage,
    );

  // Bootstrap the first platform admin from the environment, once.
  const bootEmail =
    process.env.PLATFORM_ADMIN_EMAIL;
  const bootPass =
    process.env
      .PLATFORM_ADMIN_PASSWORD;

  if (bootEmail && bootPass) {
    try {
      const created =
        await admins.ensureBootstrapAdmin(
          bootEmail,
          bootPass,
          process.env
            .PLATFORM_ADMIN_NAME,
        );

      if (created) {
        console.log(
          `Bootstrapped platform admin: ${bootEmail}`,
        );
      }
    } catch (error) {
      console.error(
        "Failed to bootstrap platform admin.",
        error,
      );
    }
  }

  const fileStorage = new LocalStorageProvider(
    process.env.FILE_STORAGE_DIR ||
      `${process.env.HOME || "."}/aecloud/storage`,
  );
  const files = new PlatformFileService(
    new PlatformFileRepository(db),
    fileStorage,
  );

  const marketingConsent = new MarketingConsentService(
    new MarketingConsentRepository(db),
  );
  // Marketing activation (durable intent) + durable, transactional double-opt-in
  // confirmation dispatch. Inert until a form configures a target sequence; the
  // sending worker itself is wired in a later stage (operational safeguards).
  const marketingActivations = new MarketingActivationService(
    new MarketingActivationRepository(db),
  );
  const confirmationDispatch = new ConfirmationDispatchService(
    new ConfirmationDispatchRepository(db),
  );
  // Durable marketing outbox + operational safeguards (limits/pause). The
  // sending WORKER is env-gated and off by default (production behaviour is
  // unchanged until a deliberate cutover); these services back the owner/admin
  // review + control routes regardless.
  const marketingOutboxRepo = new MarketingOutboxRepository(db);
  const marketingOutbox = new MarketingOutboxService(marketingOutboxRepo);
  const marketingLimits = new MarketingLimitsService(
    new MarketingMeterRepository(db),
  );
  const marketingPause = new MarketingPauseService(
    new MarketingPauseRepository(db),
  );
  const forms = new PlatformFormService(
    new PlatformFormRepository(db),
    {
      leads,
      email,
      activity,
      consent: marketingConsent,
      activations: marketingActivations,
      confirmationDispatch,
    },
  );

  const calendar = new CalendarService(
    new CalendarEventRepository(db),
  );
  const knowledge =
    new KnowledgeService(
      new KnowledgeRepository(db),
    );
  const audit = new AuditService(
    new AuditRepository(db),
  );

  // Platform legal documents (All Elite Cloud's own Terms/Privacy/etc.).
  // Global, owner-managed, versioned + immutable-after-publish. Lifecycle
  // actions are logged as structured audit lines (no bodies/PII), since the
  // tenant AuditService is organization-scoped and these documents are not.
  const legal = new PlatformLegalService(
    new PlatformLegalDocumentRepository(db),
    {
      audit: (event) => {
        console.log(
          `[legal-audit] ${event.action} kind=${event.kind} v${event.version} id=${event.documentId}`,
        );
      },
    },
  );
  // Seed verified platform documents on first run only (idempotent: never
  // overwrites owner edits). Documents needing owner/attorney facts seed as
  // drafts and are not served publicly until published.
  await legal.seedIfEmpty(platformLegalSeeds());

  // Terms/Privacy acceptance evidence (tenant-scoped, append-only).
  const legalAcceptance = new LegalAcceptanceService(
    new LegalAcceptanceRepository(db),
    legal,
  );

  // Tenant Legal & Compliance workspace (each org's own website legal docs).
  const tenantLegal = new TenantLegalService(
    new TenantLegalDocumentRepository(db),
    new TenantQuestionnaireRepository(db),
  );

  // Data-retention purge: hard-delete files soft-deleted longer than the
  // retention window (default 30 days), removing bytes + row, per-org,
  // legal-hold-aware, and audited. Backs the Privacy Policy's retention claim.
  const retention = new RetentionService({
    listPurgeableFiles: async (cutoffIso) => {
      const r = await db.query(
        `SELECT id, organization_id, stored_key
           FROM files
          WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
        [cutoffIso],
      );
      return r.rows.map((row) => ({
        id: String(row.id),
        organizationId: String(row.organization_id),
        storedKey: String(row.stored_key),
      }));
    },
    deleteFileBytes: (key) =>
      fileStorage.delete(key).catch(() => {
        // A missing object is fine — the goal is that it no longer exists.
      }),
    deleteFileRow: async (id) => {
      await db.query("DELETE FROM files WHERE id = $1", [id]);
    },
    isOrgOnLegalHold: async (organizationId) => {
      const r = await db.query(
        "SELECT 1 FROM legal_holds WHERE organization_id = $1 LIMIT 1",
        [organizationId],
      );
      return r.rows.length > 0;
    },
    audit: (event) =>
      runWithTenant(
        { organizationId: event.organizationId },
        () =>
          audit.record({
            actorType: "system",
            action: event.action,
            outcome: "success",
            metadata: { count: event.count },
          }),
      ).then(() => {
        // fire-and-forget; auditing never blocks a purge
      }),
  });
  const RETENTION_TICK_MS = Number(
    process.env.RETENTION_TICK_MS ?? 24 * 60 * 60 * 1000,
  );
  const runPurge = () => {
    retention
      .purgeDeletedFiles(
        Number(process.env.RETENTION_FILE_DAYS ?? 30),
      )
      .then((r) => {
        if (r.purgedFiles > 0 || r.skippedHeldOrgs > 0) {
          console.log(
            `[retention] purged ${r.purgedFiles} file(s) across ${r.purgedOrgs} org(s); skipped ${r.skippedHeldOrgs} on legal hold`,
          );
        }
      })
      .catch((err) => {
        console.error(
          "[retention] purge failed",
          err instanceof Error ? err.message : err,
        );
      });
  };
  const retentionTimer = setInterval(runPurge, RETENTION_TICK_MS);
  if (typeof retentionTimer.unref === "function") {
    retentionTimer.unref();
  }
  // Kick off an initial purge shortly after boot (never blocks startup).
  setTimeout(runPurge, 30_000).unref?.();
  // Owners/admins to notify (shared by the notification dispatcher + workflows).
  const notifyRecipients = () =>
    users
      .list()
      .then((list) =>
        list
          .filter(
            (u) =>
              u.status ===
                "active" &&
              (u.role === "owner" ||
                u.role === "admin"),
          )
          .map((u) => u.id),
      )
      .catch(() => []);
  const workflows =
    new WorkflowService(
      new WorkflowRepository(db),
      {
        notifications,
        email,
        drip,
        activity,
        resolveNotifyRecipients:
          notifyRecipients,
      },
    );
  // Workflows are triggered by activity events and advanced by a tick worker.
  activity.subscribe(
    workflows.handleEvent,
  );

  // AI tool registry — the closed, code-defined set of actions an AI surface
  // may take. Read tools run on invoke; write tools are proposed and require
  // human confirmation before they execute.
  const aiToolRegistry =
    new AiToolRegistry();
  for (const tool of buildDefaultAiTools(
    {
      // The lead service validates status via isLeadStatus (invalid → keeps
      // the current stage), so the tool's string status is safe to pass.
      leads: {
        list: () => leads.list(),
        create: (input) =>
          leads.create(input),
        update: (id, changes) =>
          leads.update(
            id,
            changes as Parameters<
              typeof leads.update
            >[1],
          ),
      },
      clients,
      projects,
      invoices,
      // The ticket service validates/coerces priority + status internally, so
      // the tool's looser string input is safe to hand through.
      tickets: {
        list: () => tickets.list(),
        create: (input) =>
          tickets.create(
            input as Parameters<
              typeof tickets.create
            >[0],
          ),
      },
      activity,
      notifications,
      resolveNotifyRecipients:
        notifyRecipients,
    },
  )) {
    aiToolRegistry.register(tool);
  }
  const aiTools = new AiToolService(
    aiToolRegistry,
    new AiToolInvocationRepository(db),
    { audit },
  );

  // AI Command Center — chats using the tool registry. Uses the platform's
  // included client when present (else disconnected), and a tenant's own key
  // when they've configured one.
  const defaultChatClient: ChatClient =
    openAiKey
      ? new OpenAiChatClient({
          apiKey: openAiKey,
          model:
            process.env
              .OPENAI_MODEL ||
            undefined,
        })
      : new DisconnectedChatClient();
  const aiConsole =
    new AiConsoleService(
      aiToolRegistry,
      aiTools,
      {
        aiSettings,
        aiUsage,
        clientFactory:
          createChatClient,
        defaultClient:
          defaultChatClient,
      },
    );
  const aiEmployees =
    new AiEmployeeService(
      new AiEmployeeRepository(db),
    );

  const aiConversations =
    new AiConversationService(
      new AiConversationRepository(db),
    );

  const search = new SearchService({
    clients,
    leads,
    projects,
    proposals,
    invoices,
    tickets,
    campaigns,
    reviews,
    brands,
    products,
    books,
    programs,
    hosting,
    users,
  });

  // System health for the superadmin console: real DB ping + connectivity
  // flags + the background-worker heartbeat (set on each tick below).
  const startedAt = new Date().toISOString();
  let workerLastTickAt:
    | string
    | null = null;
  const DRIP_TICK_MS = Number(
    process.env.DRIP_TICK_MS ??
      60_000,
  );
  const platformHealth =
    new PlatformHealthService({
      pingDb: () =>
        db
          .query("SELECT 1")
          .then(() => true),
      emailConnected:
        email.connected(),
      aiPlatformKey:
        Boolean(openAiKey),
      stripeConnected:
        billing.billingConnected(),
      workerLastTickAt: () =>
        workerLastTickAt,
      workerIntervalMs: DRIP_TICK_MS,
      marketingDeliveryMode: () =>
        deliveryMode.mode,
      startedAt,
      version:
        process.env.APP_VERSION ??
        process.env
          .npm_package_version ??
        "unknown",
    });

  // Success Center checklist. Each signal is a REAL measurement of the
  // (ambiently tenant-scoped) services, evaluated inside the request context.
  const workspacePreferences =
    new WorkspacePreferencesService(
      new WorkspacePreferencesRepository(
        db,
      ),
    );

  const onboarding =
    new OnboardingService({
      brand: async () => {
        const b = await branding.get();
        return Boolean(
          b.displayName ||
            b.logoUrl ||
            b.primaryColor ||
            b.accentColor,
        );
      },
      client: () =>
        clients
          .list()
          .then((r) => r.length > 0),
      website: () =>
        websites
          .list()
          .then((r) => r.length > 0),
      "ai-employee": () =>
        aiEmployees
          .list()
          .then((r) => r.length > 0),
      campaign: () =>
        campaigns
          .list()
          .then((r) => r.length > 0),
      team: () =>
        users
          .list()
          .then((r) => r.length >= 2),
    });

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding,
    clients,
    projects,
    invoices,
    signup,
    passwordReset,
    domains,
    hosting,
    tickets,
    leads,
    unsubscribe,
    doubleOptIn,
    marketingConsent,
    marketingActivations,
    marketingOutbox,
    marketingPause,
    confirmationDispatch,
    emailVerification,
    marketingSender,
    emailProvider,
    transactionalSender,
    proposals,
    campaigns,
    reviews,
    brands,
    products,
    books,
    programs,
    clientUsers,
    portalSessions,
    email,
    drip,
    activity,
    notifications,
    search,
    files,
    forms,
    calendar,
    knowledge,
    audit,
    workflows,
    aiTools,
    aiConsole,
    aiEmployees,
    aiConversations,
    websites,
    aiSettings,
    aiUsage,
    billing,
    admins,
    adminSessions,
    platformAnalytics,
    platformHealth,
    onboarding,
    preferences:
      workspacePreferences,
    legal,
    legalAcceptance,
    tenantLegal,
    baseDomain:
      process.env
        .PLATFORM_BASE_DOMAIN ||
      undefined,
    secureCookie:
      process.env
        .PLATFORM_SECURE_COOKIE ===
      "true",
    docsDir:
      process.env.DOCS_DIR ||
      `${process.cwd()}/docs`,
    marketplacePreviewsDir:
      process.env
        .MARKETPLACE_PREVIEWS_DIR ||
      `${process.cwd()}/marketplace-previews`,
  });

  const port = Number(
    process.env.PLATFORM_PORT ?? 3300,
  );
  // Bind to loopback by default so the app is reachable ONLY through the
  // Apache reverse proxy. This is what makes `trust proxy = 1` safe: if the
  // port were public (0.0.0.0), a client could connect directly and spoof
  // X-Forwarded-For to forge req.ip and bypass IP-based rate limiting/audit.
  // Overridable via PLATFORM_BIND_HOST only for environments without a proxy.
  const host =
    process.env.PLATFORM_BIND_HOST?.trim() ||
    "127.0.0.1";

  const server = app.listen(
    port,
    host,
    () => {
      console.log(
        `All Elite Cloud platform listening on ${host}:${port}`,
      );
      // Report the active marketing delivery mode (no secrets) so operators can
      // confirm exactly one path is live before enabling volume.
      console.log(`All Elite Cloud ${describeDeliveryMode(deliveryMode)}`);
    },
  );

  // Drip worker: every minute, send any due autoresponder steps across all
  // tenants. unref() so it never keeps the process alive on shutdown.
  // (DRIP_TICK_MS is declared above, alongside the health service.)
  const dripTimer = setInterval(() => {
    // Heartbeat for the system-health panel: proves the worker is ticking.
    workerLastTickAt =
      new Date().toISOString();
    drip
      .runDue()
      .catch((error: unknown) => {
        console.error(
          "Drip worker tick failed.",
          error,
        );
      });
    workflows
      .runDue()
      .catch((error: unknown) => {
        console.error(
          "Workflow worker tick failed.",
          error,
        );
      });
  }, DRIP_TICK_MS);
  dripTimer.unref();

  // Marketing/confirmation worker. It ALWAYS runs so the TRANSACTIONAL
  // double-opt-in confirmation dispatch keeps working in every mode; its
  // MARKETING processing is gated INTERNALLY by the delivery mode (outbox only).
  // Ready-activation processing (which seeds outbox marketing work) also runs
  // only in `outbox` mode. Mutual exclusivity with the legacy drip path is
  // guaranteed by the single mode: drip.runDue sends only in `legacy`; the
  // worker's marketing runs only in `outbox`.
  const MARKETING_TICK_MS = Number(process.env.MARKETING_TICK_MS ?? 60_000);
  const marketingBaseDomain =
    process.env.PLATFORM_BASE_DOMAIN?.trim() || "allelitecloud.com";
  const activationGates = createActivationGates({
    consent: marketingConsent,
    suppression,
    leads,
    drip,
    outbox: marketingOutbox,
  });
  const marketingWorker: MarketingWorker = new MarketingWorker({
    outbox: marketingOutboxRepo,
    limits: marketingLimits,
    pause: marketingPause,
    mode: marketingMode,
    confirmation: {
      service: confirmationDispatch,
      eligibility: async (row) => {
        const d = await suppression.marketingDeliverability(
          row.organizationId,
          row.email,
        );
        return d.eligible
          ? { eligible: true }
          : { eligible: false, reason: d.reason ?? "suppressed" };
      },
      send: createConfirmationSend({
        doubleOptIn,
        marketingSender,
        emailProvider,
      }),
    },
    eligibility: createMarketingEligibility({
      consent: marketingConsent,
      suppression,
      leads,
      drip,
      marketingSender,
    }),
    send: createMarketingSend({
      marketingSender,
      emailProvider,
      unsubscribe,
      unsubscribeBase: `https://${marketingBaseDomain}`,
    }),
  });
  const marketingTimer: NodeJS.Timeout = setInterval(() => {
    workerLastTickAt = new Date().toISOString();
    void (async () => {
      try {
        // Confirmation always; marketing only in `outbox` mode (internal gate).
        await marketingWorker.runOnce("platform");
        // Activation → enrollment + first outbox step is outbox-only work.
        if (marketingMode() === "outbox") {
          await marketingActivations.activateReady(activationGates);
        }
      } catch (error: unknown) {
        console.error("Marketing worker tick failed.", error);
      }
    })();
  }, MARKETING_TICK_MS);
  marketingTimer.unref();

  let shuttingDown = false;

  const shutdown = (
    signal: string,
  ): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(
      `Received ${signal}. Shutting down platform.`,
    );

    clearInterval(dripTimer);
    // Marketing worker: stop claiming new work; any in-flight lease completes or
    // safely expires (recovered as delivery_unknown on next start, never resent).
    if (marketingTimer) clearInterval(marketingTimer);
    marketingWorker?.beginShutdown();

    server.close(() => {
      void db
        .close()
        .catch(() => undefined)
        .finally(() =>
          process.exit(0),
        );
    });
  };

  process.on("SIGINT", () =>
    shutdown("SIGINT"),
  );
  process.on("SIGTERM", () =>
    shutdown("SIGTERM"),
  );
}

start().catch(
  (error: unknown) => {
    console.error(
      "All Elite Cloud platform failed to start.",
      error,
    );

    process.exit(1);
  },
);
