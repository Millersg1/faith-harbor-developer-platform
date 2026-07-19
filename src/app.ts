import { existsSync } from "node:fs";
import { join } from "node:path";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { DatabaseSync } from "node:sqlite";

import { InvoiceRepository } from "./accounting/InvoiceRepository";
import { createInvoiceRouter } from "./accounting/InvoiceRouter";
import { InvoiceService } from "./accounting/InvoiceService";
import { AutomationRepository } from "./automation/AutomationRepository";
import { createAutomationRouter } from "./automation/AutomationRouter";
import { AutomationScanner } from "./automation/AutomationScanner";
import { AutomationService } from "./automation/AutomationService";
import { createAuthRouter } from "./auth/AuthRouter";
import { CampaignRepository } from "./marketing/CampaignRepository";
import { createCampaignRouter } from "./marketing/CampaignRouter";
import { CampaignService } from "./marketing/CampaignService";
import { ProgramRepository } from "./ministry/ProgramRepository";
import { createProgramRouter } from "./ministry/ProgramRouter";
import { ProgramService } from "./ministry/ProgramService";
import { AuthService } from "./auth/AuthService";
import { requireAuth } from "./auth/requireAuth";
import type { AIService } from "./ai/AIService";
import {
  AIBootstrap,
  type AIOperationsDatabase,
} from "./ai/bootstrap/AIBootstrap";
import type { AIProviderInstaller } from "./ai/installers/AIProviderInstaller";
import { BlackboxProviderInstaller } from "./ai/installers/BlackboxProviderInstaller";
import { OllamaProviderInstaller } from "./ai/installers/OllamaProviderInstaller";
import { OpenAIProviderInstaller } from "./ai/installers/OpenAIProviderInstaller";
import { createAIRouter } from "./ai/routes/AIRouter";
import { createClientRouter } from "./clients/ClientRouter";
import { ClientService } from "./clients/ClientService";
import { EmailRepository } from "./communications/EmailRepository";
import { createEmailRouter } from "./communications/EmailRouter";
import { EmailService } from "./communications/EmailService";
import {
  HttpEmailTransport,
  LoggingEmailTransport,
  type EmailTransport,
} from "./communications/EmailTransport";
import { config } from "./config";
import { DepartmentService } from "./departments/DepartmentService";
import { defaultDepartments } from "./departments/defaultDepartments";
import { ProductRepository } from "./engineering/ProductRepository";
import { createProductRouter } from "./engineering/ProductRouter";
import { ProductService } from "./engineering/ProductService";
import { HostingAccountRepository } from "./hosting/HostingAccountRepository";
import { HostingAccountService } from "./hosting/HostingAccountService";
import { createHostingRouter } from "./hosting/HostingRouter";
import { HostingAssistantService } from "./hosting/assistant/HostingAssistantService";
import { nodeDnsResolver } from "./hosting/assistant/HostingDiagnostics";
import { WHMClient } from "./hosting/whm/WHMClient";
import { SQLiteDatabase } from "./persistence/SQLiteDatabase";
import { ProjectRepository } from "./projects/ProjectRepository";
import { createProjectRouter } from "./projects/ProjectRouter";
import { ProjectService } from "./projects/ProjectService";
import { ProposalRepository } from "./proposals/ProposalRepository";
import { createProposalRouter } from "./proposals/ProposalRouter";
import { ProposalService } from "./proposals/ProposalService";
import { BookRepository } from "./publishing/BookRepository";
import { createBookRouter } from "./publishing/BookRouter";
import { BookService } from "./publishing/BookService";
import { LeadRepository } from "./sales/LeadRepository";
import { createLeadRouter } from "./sales/LeadRouter";
import { LeadService } from "./sales/LeadService";
import { TicketRepository } from "./support/TicketRepository";
import { createTicketRouter } from "./support/TicketRouter";
import { TicketService } from "./support/TicketService";
import { WorkflowEngine } from "./workflow";
import { createWorkflowRouter } from "./workflow/WorkflowRouter";

function createProviderInstallers():
  AIProviderInstaller[] {
  const installers: AIProviderInstaller[] = [
    new OllamaProviderInstaller({
      model: "hermes3:latest",
    }),
  ];

  if (config.OPENAI_API_KEY) {
    installers.push(
      new OpenAIProviderInstaller({
        apiKey:
          config.OPENAI_API_KEY,

        organization:
          config.OPENAI_ORGANIZATION,

        project:
          config.OPENAI_PROJECT,
      }),
    );
  }

  if (config.BLACKBOX_API_KEY) {
    installers.push(
      new BlackboxProviderInstaller(
        config.BLACKBOX_API_KEY,
      ),
    );
  }

  return installers;
}

/**
 * Creates an Express application.
 *
 * Tests can call this synchronously without configuring
 * external AI providers or opening a database.
 *
 * When a SQLite connection is supplied, clients, proposals,
 * and projects persist across application restarts.
 */
export function createApp(
  aiService?: AIService,
  database?: DatabaseSync,
  authService?: AuthService,
) {
  const app = express();

  const workflowEngine =
    new WorkflowEngine();

  const departmentService =
    new DepartmentService();

  const clientService =
    new ClientService(database);

  // Email is safe by default: when no provider is configured the
  // logging transport records messages to the outbox without
  // sending. Set EMAIL_API_URL + EMAIL_API_KEY to deliver for real.
  const emailTransport:
    EmailTransport =
    config.EMAIL_API_URL &&
    config.EMAIL_API_KEY
      ? new HttpEmailTransport({
          apiUrl:
            config.EMAIL_API_URL,
          apiKey:
            config.EMAIL_API_KEY,
        })
      : new LoggingEmailTransport();

  const emailService =
    new EmailService(
      emailTransport,
      config.EMAIL_FROM ??
        config.ADMIN_EMAIL ??
        "Faith Harbor OS",
      new EmailRepository(database),
    );

  // The automation engine prepares proposed actions (today, email
  // drafts) in response to business events and holds them for human
  // approval. It never sends anything without an explicit approval.
  const automationService =
    new AutomationService(
      emailService,
      new AutomationRepository(
        database,
      ),
    );

  const proposalRepository =
    new ProposalRepository(database);

  const proposalService =
    aiService
      ? new ProposalService(
          aiService,
          clientService,
          proposalRepository,
        )
      : undefined;

  const projectRepository =
    new ProjectRepository(database);

  const projectService =
    new ProjectService(
      clientService,
      projectRepository,
      (project, client) =>
        automationService.onProjectCreated(
          project,
          client,
        ),
    );

  const invoiceRepository =
    new InvoiceRepository(database);

  const invoiceService =
    new InvoiceService(
      clientService,
      invoiceRepository,
    );

  const ticketRepository =
    new TicketRepository(database);

  const ticketService =
    new TicketService(
      clientService,
      ticketRepository,
    );

  const bookRepository =
    new BookRepository(database);

  const bookService =
    new BookService(
      clientService,
      bookRepository,
    );

  const leadRepository =
    new LeadRepository(database);

  const leadService =
    new LeadService(
      clientService,
      leadRepository,
      (lead) =>
        automationService.onLeadCreated(
          lead,
        ),
    );

  // The scanner is the periodic side of automation: it finds
  // time-based work — overdue invoices, quiet leads, stalled
  // projects — and asks the engine to prepare drafts for review. The
  // scheduler that runs it lives in the server entry point so tests
  // never start timers.
  const automationScanner =
    new AutomationScanner(
      invoiceService,
      clientService,
      automationService,
      {
        leads: leadService,
        projects: projectService,
        leadQuietDays:
          config.AUTOMATION_LEAD_QUIET_DAYS,
        projectStalledDays:
          config.AUTOMATION_PROJECT_STALLED_DAYS,
      },
    );

  const campaignRepository =
    new CampaignRepository(database);

  const campaignService =
    new CampaignService(
      clientService,
      campaignRepository,
    );

  const programRepository =
    new ProgramRepository(database);

  const programService =
    new ProgramService(
      clientService,
      programRepository,
    );

  const productRepository =
    new ProductRepository(database);

  const productService =
    new ProductService(
      clientService,
      productRepository,
    );

  const hostingRepository =
    new HostingAccountRepository(
      database,
    );

  const hostingService =
    new HostingAccountService(
      clientService,
      hostingRepository,
    );

  // The WHM connection is optional and read-only. It is enabled
  // only when both a host and an API token are configured.
  const whmClient =
    config.WHM_HOST &&
    config.WHM_API_TOKEN
      ? new WHMClient({
          host: config.WHM_HOST,
          apiToken:
            config.WHM_API_TOKEN,
          user: config.WHM_USER,
          port: config.WHM_PORT,
          useSsl: true,
        })
      : undefined;

  const hostingAssistantService =
    new HostingAssistantService(
      hostingService,
      {
        aiService,
        ticketService,

        // Live DNS checks are skipped under test so the suite
        // stays offline and deterministic.
        dnsResolver:
          config.NODE_ENV === "test"
            ? undefined
            : nodeDnsResolver,
      },
    );

  for (
    const department of
    defaultDepartments
  ) {
    departmentService.createDepartment(
      department,
    );
  }

  app.disable("x-powered-by");

  app.use(helmet());

  // The UI is served from the same origin in production, so
  // cross-origin requests are disabled unless an explicit origin
  // is configured. Credentials (the session cookie) are allowed.
  app.use(
    cors({
      origin:
        config.CORS_ORIGIN ?? false,
      credentials: true,
    }),
  );

  app.use(
    express.json({
      limit: "1mb",
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader(
      "X-Robots-Tag",
      "noindex, nofollow",
    );

    next();
  });

  app.use(
    "/console",
    express.static(
      join(
        process.cwd(),
        "public",
      ),
    ),
  );

  app.get("/api", (_req, res) => {
    res.json({
      name:
        config.APP_NAME,

      version:
        config.APP_VERSION,

      mission:
        "Technology is our tool. People are our purpose. Christ is our foundation.",

      status:
        "persistent-client-workspace",

      links: {
        console:
          "/console/",

        health:
          "/health",

        departments:
          "/api/v1/departments",

        clients:
          "/api/v1/clients",

        ai:
          "/api/v1/ai",

        proposals:
          "/api/v1/proposals",

        projects:
          "/api/v1/projects",

        invoices:
          "/api/v1/invoices",

        tickets:
          "/api/v1/tickets",

        books:
          "/api/v1/books",

        leads:
          "/api/v1/leads",

        campaigns:
          "/api/v1/campaigns",

        programs:
          "/api/v1/programs",

        products:
          "/api/v1/products",

        emails:
          "/api/v1/emails",

        automations:
          "/api/v1/automations",

        hosting:
          "/api/v1/hosting/accounts",

        workflows:
          "/api/v1/workflows",
      },
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status:
        "ok",

      service:
        config.APP_NAME,

      version:
        config.APP_VERSION,

      environment:
        config.NODE_ENV,

      databaseConfigured:
        Boolean(database) ||
        Boolean(
          config.DATABASE_URL,
        ),

      aiConfigured:
        Boolean(aiService),

      proposalGenerationAvailable:
        Boolean(proposalService),

      clientManagementAvailable:
        true,

      projectManagementAvailable:
        true,

      persistentClientStorage:
        Boolean(database),

      persistentProposalStorage:
        Boolean(database),

      persistentProjectStorage:
        Boolean(database),

      invoiceManagementAvailable:
        true,

      persistentInvoiceStorage:
        Boolean(database),

      supportManagementAvailable:
        true,

      persistentSupportStorage:
        Boolean(database),

      publishingManagementAvailable:
        true,

      persistentPublishingStorage:
        Boolean(database),

      salesManagementAvailable:
        true,

      persistentSalesStorage:
        Boolean(database),

      marketingManagementAvailable:
        true,

      persistentMarketingStorage:
        Boolean(database),

      ministryManagementAvailable:
        true,

      persistentMinistryStorage:
        Boolean(database),

      engineeringManagementAvailable:
        true,

      persistentEngineeringStorage:
        Boolean(database),

      emailAvailable:
        true,

      emailDeliveryConfigured:
        Boolean(
          config.EMAIL_API_URL &&
            config.EMAIL_API_KEY,
        ),

      automationAvailable:
        true,

      persistentAutomationStorage:
        Boolean(database),

      hostingManagementAvailable:
        true,

      persistentHostingStorage:
        Boolean(database),

      whmConfigured:
        Boolean(whmClient),

      timestamp:
        new Date().toISOString(),
    });
  });

  // Authentication gate. When an auth service is configured, the
  // login routes are public and everything else under /api/v1
  // requires a valid session. The static UI shell stays public so
  // it can render the login screen; all data lives behind the gate.
  if (authService) {
    app.use(
      "/api/v1/auth",
      createAuthRouter(authService),
    );

    app.use(
      "/api/v1",
      requireAuth(authService),
    );
  }

  app.get(
    "/api/v1/departments",
    (_req, res) => {
      const departments =
        departmentService
          .listDepartments();

      res.json({
        count:
          departments.length,

        departments,
      });
    },
  );

  app.use(
  "/api/v1/clients",
  createClientRouter(
    clientService,
    proposalService,
    projectService,
  ),
);

  app.use(
    "/api/v1/ai",
    createAIRouter(aiService),
  );

  app.use(
    "/api/v1/proposals",
    createProposalRouter(
      proposalService,
    ),
  );

  app.use(
    "/api/v1/projects",
    createProjectRouter(
      projectService,
    ),
  );

  app.use(
    "/api/v1/invoices",
    createInvoiceRouter(
      invoiceService,
    ),
  );

  app.use(
    "/api/v1/tickets",
    createTicketRouter(
      ticketService,
    ),
  );

  app.use(
    "/api/v1/books",
    createBookRouter(
      bookService,
    ),
  );

  app.use(
    "/api/v1/leads",
    createLeadRouter(
      leadService,
    ),
  );

  app.use(
    "/api/v1/campaigns",
    createCampaignRouter(
      campaignService,
    ),
  );

  app.use(
    "/api/v1/programs",
    createProgramRouter(
      programService,
    ),
  );

  app.use(
    "/api/v1/products",
    createProductRouter(
      productService,
    ),
  );

  app.use(
    "/api/v1/emails",
    createEmailRouter(
      emailService,
    ),
  );

  app.use(
    "/api/v1/automations",
    createAutomationRouter(
      automationService,
      automationScanner,
    ),
  );

  // Exposed so the server entry point can run periodic scans.
  app.locals.automationScanner =
    automationScanner;

  app.use(
    "/api/v1/hosting",
    createHostingRouter(
      hostingService,
      whmClient,
      hostingAssistantService,
    ),
  );

  app.use(
    "/api/v1/workflows",
    createWorkflowRouter(
      workflowEngine,
    ),
  );

  // Serve the built React frontend when it is present.
  //
  // In production a single Node process serves both the API and
  // the UI from the same origin (the cPanel deployment model).
  // In development the Vite dev server runs separately and proxies
  // API requests here, so this block is simply skipped.
  const frontendDist =
    join(
      process.cwd(),
      "frontend",
      "dist",
    );

  if (existsSync(frontendDist)) {
    app.use(
      express.static(
        frontendDist,
      ),
    );

    // Single-page-app fallback: any non-API GET request that
    // accepts HTML returns index.html so client-side routes
    // (for example /clients or /support) work on a hard refresh.
    app.use(
      (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }

        if (
          req.path.startsWith(
            "/api",
          ) ||
          req.path.startsWith(
            "/health",
          ) ||
          req.path.startsWith(
            "/console",
          )
        ) {
          next();
          return;
        }

        if (!req.accepts("html")) {
          next();
          return;
        }

        res.sendFile(
          join(
            frontendDist,
            "index.html",
          ),
        );
      },
    );
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code:
          "NOT_FOUND",

        message:
          "The requested resource was not found.",
      },
    });
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next:
        express.NextFunction,
    ) => {
      console.error(error);

      res.status(500).json({
        error: {
          code:
            "INTERNAL_ERROR",

          message:
            "An unexpected error occurred.",
        },
      });
    },
  );

  return app;
}

/**
 * Builds the single-administrator auth service from configuration,
 * or returns undefined when no credentials are configured.
 */
function createAuthService():
  AuthService | undefined {
  if (
    config.ADMIN_EMAIL &&
    (config.ADMIN_PASSWORD_HASH ||
      config.ADMIN_PASSWORD)
  ) {
    return new AuthService({
      adminEmail:
        config.ADMIN_EMAIL,

      passwordHash:
        config.ADMIN_PASSWORD_HASH,

      passwordPlain:
        config.ADMIN_PASSWORD,

      sessionTtlMs:
        config.SESSION_TTL_HOURS *
        60 *
        60 *
        1000,
    });
  }

  return undefined;
}

/**
 * Creates the production application, initializes SQLite,
 * and installs all configured AI providers and workers.
 */
export async function createConfiguredApp() {
  const authService =
    createAuthService();

  // A production deployment must never run unauthenticated.
  if (
    config.NODE_ENV ===
      "production" &&
    !authService
  ) {
    throw new Error(
      "Refusing to start: authentication is not configured. " +
        "Set ADMIN_EMAIL and ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) in the environment.",
    );
  }

  const database =
    new SQLiteDatabase();

  const installers =
    createProviderInstallers();

  try {
    const aiService =
      await AIBootstrap.create(
        installers,

        database.connection as unknown as
          AIOperationsDatabase,
      );

    const app =
      createApp(
        aiService,
        database.connection,
        authService,
      );

    app.locals.database =
      database;

    return app;
  } catch (error) {
    database.close();

    throw error;
  }
}