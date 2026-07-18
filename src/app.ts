import { existsSync } from "node:fs";
import { join } from "node:path";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { DatabaseSync } from "node:sqlite";

import { InvoiceRepository } from "./accounting/InvoiceRepository";
import { createInvoiceRouter } from "./accounting/InvoiceRouter";
import { InvoiceService } from "./accounting/InvoiceService";
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
import { config } from "./config";
import { DepartmentService } from "./departments/DepartmentService";
import { defaultDepartments } from "./departments/defaultDepartments";
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
) {
  const app = express();

  const workflowEngine =
    new WorkflowEngine();

  const departmentService =
    new DepartmentService();

  const clientService =
    new ClientService(database);

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
  app.use(cors());

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
 * Creates the production application, initializes SQLite,
 * and installs all configured AI providers and workers.
 */
export async function createConfiguredApp() {
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
      );

    app.locals.database =
      database;

    return app;
  } catch (error) {
    database.close();

    throw error;
  }
}