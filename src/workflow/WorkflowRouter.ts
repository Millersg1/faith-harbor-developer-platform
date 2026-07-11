import { Router } from "express";
import { WorkflowEngine } from "./WorkflowEngine";
import { actorSchema, createWorkflowSchema } from "./WorkflowSchemas";

export function createWorkflowRouter(engine: WorkflowEngine) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ workflows: engine.list() });
  });

  router.get("/:id", (req, res) => {
    try {
      res.json(engine.get(req.params.id));
    } catch (error) {
      res.status(404).json({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: error instanceof Error ? error.message : "Workflow not found.",
        },
      });
    }
  });

  router.post("/", (req, res) => {
    const parsed = createWorkflowSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_WORKFLOW",
          message: "Workflow validation failed.",
          details: parsed.error.flatten(),
        },
      });
    }

    try {
      return res.status(201).json(engine.create(parsed.data, "api"));
    } catch (error) {
      return res.status(409).json({
        error: {
          code: "WORKFLOW_CONFLICT",
          message: error instanceof Error ? error.message : "Workflow conflict.",
        },
      });
    }
  });

  router.post("/:id/submit", (req, res) => {
    const actor = actorSchema.parse(req.body).actor;
    try {
      res.json(engine.submit(req.params.id, actor));
    } catch (error) {
      res.status(400).json({ error: { code: "WORKFLOW_TRANSITION_ERROR", message: String(error) } });
    }
  });

  router.post("/:id/start", (req, res) => {
    const actor = actorSchema.parse(req.body).actor;
    try {
      res.json(engine.start(req.params.id, actor));
    } catch (error) {
      res.status(400).json({ error: { code: "WORKFLOW_TRANSITION_ERROR", message: String(error) } });
    }
  });

  router.post("/:id/approve", (req, res) => {
    const actor = actorSchema.parse(req.body).actor;
    try {
      res.json(engine.approve(req.params.id, actor));
    } catch (error) {
      res.status(400).json({ error: { code: "WORKFLOW_TRANSITION_ERROR", message: String(error) } });
    }
  });

  router.post("/:id/reject", (req, res) => {
    const actor = actorSchema.parse(req.body).actor;
    try {
      res.json(engine.reject(req.params.id, actor));
    } catch (error) {
      res.status(400).json({ error: { code: "WORKFLOW_TRANSITION_ERROR", message: String(error) } });
    }
  });

  router.post("/:id/complete", (req, res) => {
    const actor = actorSchema.parse(req.body).actor;
    try {
      res.json(engine.complete(req.params.id, actor));
    } catch (error) {
      res.status(400).json({ error: { code: "WORKFLOW_TRANSITION_ERROR", message: String(error) } });
    }
  });

  router.get("/:id/history", (req, res) => {
    try {
      res.json({ events: engine.history(req.params.id) });
    } catch (error) {
      res.status(404).json({
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: error instanceof Error ? error.message : "Workflow not found.",
        },
      });
    }
  });

  return router;
}
