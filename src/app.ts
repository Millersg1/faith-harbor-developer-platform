import { join } from "node:path";

import cors from "cors";
import express from "express";
import helmet from "helmet";

import type { AIService } from "./ai/AIService";
import { AIBootstrap } from "./ai/bootstrap/AIBootstrap";
import type { AIProviderInstaller } from "./ai/installers/AIProviderInstaller";
import { BlackboxProviderInstaller } from "./ai/installers/BlackboxProviderInstaller";
import { OllamaProviderInstaller } from "./ai/installers/OllamaProviderInstaller";
import { OpenAIProviderInstaller } from "./ai/installers/OpenAIProviderInstaller";
import { createAIRouter } from "./ai/routes/AIRouter";
import { config } from "./config";
import { DepartmentService } from "./departments/DepartmentService";
import { defaultDepartments } from "./departments/defaultDepartments";
import { WorkflowEngine } from "./workflow";
import { createWorkflowRouter } from "./workflow/WorkflowRouter";

function createProviderInstallers(): AIProviderInstaller[] {
  const installers: AIProviderInstaller[] = [
    new OllamaProviderInstaller({
      model: "hermes3:latest",
    }),
  ];

  if (config.OPENAI_API_KEY) {
    installers.push(
      new OpenAIProviderInstaller({
        apiKey: config.OPENAI_API_KEY,
        organization: config.OPENAI_ORGANIZATION,
        project: config.OPENAI_PROJECT,
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
 * external AI providers.
 */
export function createApp(
  aiService?: AIService,
) {
  const app = express();
  const workflowEngine = new WorkflowEngine();
  const departmentService = new DepartmentService();

  for (const department of defaultDepartments) {
    departmentService.createDepartment(department);
  }

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use((_req, res, next) => {
    res.setHeader(
      "X-Robots-Tag",
      "noindex, nofollow",
    );

    next();
  });

  app.use(
    "/console",
    express.static(join(process.cwd(), "public")),
  );

  app.get("/", (_req, res) => {
    res.json({
      name: config.APP_NAME,
      version: config.APP_VERSION,
      mission:
        "Technology is our tool. People are our purpose. Christ is our foundation.",
      status: "workflow-foundation",
      links: {
        console: "/console/",
        health: "/health",
        departments: "/api/v1/departments",
        ai: "/api/v1/ai",
        workflows: "/api/v1/workflows",
      },
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: config.APP_NAME,
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
      databaseConfigured: Boolean(
        config.DATABASE_URL,
      ),
      aiConfigured: Boolean(aiService),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1/departments", (_req, res) => {
    const departments =
      departmentService.listDepartments();

    res.json({
      count: departments.length,
      departments,
    });
  });

  app.use(
    "/api/v1/ai",
    createAIRouter(aiService),
  );

  app.use(
    "/api/v1/workflows",
    createWorkflowRouter(workflowEngine),
  );

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
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
      _next: express.NextFunction,
    ) => {
      console.error(error);

      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message:
            "An unexpected error occurred.",
        },
      });
    },
  );

  return app;
}

/**
 * Creates the production application and installs all
 * configured AI providers.
 */
export async function createConfiguredApp() {
  const installers = createProviderInstallers();

  const aiService =
    await AIBootstrap.create(installers);

  return createApp(aiService);
}