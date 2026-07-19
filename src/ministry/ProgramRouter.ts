import { Router } from "express";
import { z } from "zod";

import type { ProgramStatus } from "./ProgramStatus";
import { ProgramService } from "./ProgramService";

const programStatusSchema = z.enum([
  "planned",
  "active",
  "paused",
  "completed",
]);

const programRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  name: z
    .string()
    .trim()
    .min(1),

  category: z
    .string()
    .trim()
    .optional(),

  status:
    programStatusSchema.optional(),

  leader: z
    .string()
    .trim()
    .optional(),

  schedule: z
    .string()
    .trim()
    .optional(),

  participants: z
    .number()
    .nonnegative()
    .optional(),

  startDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  endDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  description: z
    .string()
    .trim()
    .optional(),

  notes: z
    .string()
    .trim()
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

const programUpdateSchema =
  programRequestSchema.partial();

/**
 * Creates the ministry (programs) management routes.
 */
export function createProgramRouter(
  programService: ProgramService,
): Router {
  const router = Router();

  /**
   * Returns all programs.
   *
   * An optional clientId query parameter limits the result.
   */
  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId.trim()
        : "";

    const programs =
      clientId.length > 0
        ? programService.listForClient(
            clientId,
          )
        : programService.list();

    res.json({
      count: programs.length,
      programs,
    });
  });

  /**
   * Returns one program.
   */
  router.get(
    "/:programId",
    (req, res) => {
      try {
        res.json(
          programService.get(
            req.params.programId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "PROGRAM_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Program not found.",
          },
        });
      }
    },
  );

  /**
   * Records a program.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          programRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PROGRAM_REQUEST",
              message:
                "Program request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const program =
          programService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: program.status,
          program,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates a program.
   */
  router.patch(
    "/:programId",
    (req, res, next) => {
      try {
        const parsed =
          programUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PROGRAM_UPDATE",
              message:
                "Program update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          programService.get(
            req.params.programId,
          );

        const program =
          programService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as ProgramStatus)
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
          status: program.status,
          program,
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
                "PROGRAM_NOT_FOUND",
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
   * Deletes a program.
   */
  router.delete(
    "/:programId",
    (req, res, next) => {
      try {
        programService.delete(
          req.params.programId,
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
                "PROGRAM_NOT_FOUND",
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
