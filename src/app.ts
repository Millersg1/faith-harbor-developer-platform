import cors from "cors";
import express from "express";
import helmet from "helmet";

import { config } from "./config";
import { DepartmentService } from "./departments/DepartmentService";
import { defaultDepartments } from "./departments/defaultDepartments";
import { aiProviders, orchestrationPlatforms } from "./domain/ai";
import { WorkflowEngine } from "./workflow";
import { createWorkflowRouter } from "./workflow/WorkflowRouter";

export function createApp() {
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

  app.get("/", (_req, res) => {
    res.json({
      name: config.APP_NAME,
      version: config.APP_VERSION,
      mission:
        "Technology is our tool. People are our purpose. Christ is our foundation.",
      status: "workflow-foundation",
      links: {
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
      databaseConfigured: Boolean(config.DATABASE_URL),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1/departments", (_req, res) => {
    const departments = departmentService.listDepartments();

    res.json({
      count: departments.length,
      departments,
    });
  });

  app.get("/api/v1/ai", (_req, res) => {
    res.json({
      providers: aiProviders,
      orchestration: orchestrationPlatforms,
      finalAuthority: "Human leadership",
    });
  });

  app.use("/api/v1/workflows", createWorkflowRouter(workflowEngine));

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
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
          message: "An unexpected error occurred.",
        },
      });
    },
  );

  return app;
}