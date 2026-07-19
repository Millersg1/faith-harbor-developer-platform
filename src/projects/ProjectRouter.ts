import { Router } from "express";
import { z } from "zod";

import type { ProjectStatus } from "./ProjectStatus";
import { ProjectService } from "./ProjectService";

const projectStatusSchema = z.enum([
  "planned",
  "active",
  "completed",
  "archived",
]);

const projectRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1),

  proposalId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  name: z
    .string()
    .trim()
    .min(1),

  description: z
    .string()
    .trim()
    .optional(),

  status:
    projectStatusSchema.optional(),

  startDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  dueDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  completedDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  notes: z
    .string()
    .trim()
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

const projectUpdateSchema =
  projectRequestSchema.partial();

const fromProposalSchema = z.object({
  proposalId: z
    .string()
    .trim()
    .min(1),

  clientId: z
    .string()
    .trim()
    .min(1),

  service: z
    .string()
    .trim()
    .optional(),

  requestedOutcome: z
    .string()
    .trim()
    .optional(),

  name: z
    .string()
    .trim()
    .optional(),
});

/**
 * Creates the project management routes.
 */
export function createProjectRouter(
  projectService: ProjectService,
): Router {
  const router = Router();

  /**
   * Returns all projects.
   *
   * An optional clientId query parameter limits
   * the result to one client.
   */
  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId.trim()
        : "";

    const projects =
      clientId.length > 0
        ? projectService.listForClient(
            clientId,
          )
        : projectService.list();

    res.json({
      count: projects.length,
      projects,
    });
  });

  /**
   * Returns one project.
   */
  router.get(
    "/:projectId",
    (req, res) => {
      try {
        res.json(
          projectService.get(
            req.params.projectId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "PROJECT_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Project not found.",
          },
        });
      }
    },
  );

  /**
   * Starts a project from an accepted proposal.
   */
  router.post(
    "/from-proposal",
    (req, res, next) => {
      try {
        const parsed =
          fromProposalSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PROJECT_REQUEST",
              message:
                "Project from proposal validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const project =
          projectService.createFromProposal(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: project.status,
          project,
        });
      } catch (error) {
        // The proposal or client reference no longer exists.
        if (
          error instanceof Error &&
          (error.message.includes(
            "FOREIGN KEY",
          ) ||
            error.message.includes(
              "constraint",
            ))
        ) {
          res.status(400).json({
            error: {
              code:
                "PROPOSAL_LINK_FAILED",
              message:
                "The project could not be linked to that proposal. It may no longer exist.",
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  /**
   * Creates a project.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          projectRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PROJECT_REQUEST",
              message:
                "Project request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const project =
          projectService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: project.status,
          project,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates an existing project.
   */
  router.patch(
    "/:projectId",
    (req, res, next) => {
      try {
        const parsed =
          projectUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PROJECT_UPDATE",
              message:
                "Project update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          projectService.get(
            req.params.projectId,
          );

        const project =
          projectService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as ProjectStatus)
                : existing.status,

            metadata:
              parsed.data.metadata
                ? {
                    ...existing.metadata,
                    ...parsed.data
                      .metadata,
                  }
                : existing.metadata,
          });

        res.json({
          success: true,
          status: project.status,
          project,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "was not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "PROJECT_NOT_FOUND",
              message: error.message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  /**
   * Deletes a project.
   */
  router.delete(
    "/:projectId",
    (req, res, next) => {
      try {
        projectService.delete(
          req.params.projectId,
        );

        res.status(204).send();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "was not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "PROJECT_NOT_FOUND",
              message: error.message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  return router;
}