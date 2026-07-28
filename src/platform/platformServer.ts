import "dotenv/config";

import { PostgresDatabase } from "../persistence/PostgresDatabase";
import { OrganizationRepository } from "../tenancy/OrganizationRepository";
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
import { PlatformFormRepository } from "./forms/PlatformFormRepository";
import { CalendarService } from "./calendar/CalendarService";
import { CalendarEventRepository } from "./calendar/CalendarEventRepository";
import { KnowledgeService } from "./knowledge/KnowledgeService";
import { KnowledgeRepository } from "./knowledge/KnowledgeRepository";
import { AuditService } from "./audit/AuditService";
import { AuditRepository } from "./audit/AuditRepository";
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
  const email =
    new PlatformEmailService(
      new PlatformEmailRepository(db),
      emailTransport,
      {
        connected: emailConnected,
        fromDefault:
          process.env.SMTP_FROM?.trim() ||
          undefined,
      },
    );
  const drip = new DripService(
    new DripRepository(db),
    email,
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

  const files = new PlatformFileService(
    new PlatformFileRepository(db),
    new LocalStorageProvider(
      process.env.FILE_STORAGE_DIR ||
        `${process.env.HOME || "."}/aecloud/storage`,
    ),
  );

  const forms = new PlatformFormService(
    new PlatformFormRepository(db),
    { leads, email, activity },
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

  const server = app.listen(
    port,
    () => {
      console.log(
        `All Elite Cloud platform listening on port ${port}`,
      );
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
