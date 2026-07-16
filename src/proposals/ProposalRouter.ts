import { Router } from "express";
import { z } from "zod";

import { ProposalService } from "./ProposalService";

const proposalRequestSchema = z.object({
  clientName: z
    .string()
    .trim()
    .min(1),

  requestedOutcome: z
    .string()
    .trim()
    .min(1),

  requirements: z
    .string()
    .trim()
    .min(1),

  dueDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

/**
 * Creates the client proposal routes.
 */
export function createProposalRouter(
  proposalService?: ProposalService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    if (!proposalService) {
      res.status(503).json({
        error: {
          code: "AI_NOT_CONFIGURED",
          message:
            "Proposal management is not currently available.",
        },
      });

      return;
    }

    const proposals =
      proposalService.list();

    res.json({
      count: proposals.length,
      proposals,
    });
  });

  router.get("/:proposalId", (req, res) => {
    if (!proposalService) {
      res.status(503).json({
        error: {
          code: "AI_NOT_CONFIGURED",
          message:
            "Proposal management is not currently available.",
        },
      });

      return;
    }

    try {
      res.json(
        proposalService.get(
          req.params.proposalId,
        ),
      );
    } catch (error) {
      res.status(404).json({
        error: {
          code: "PROPOSAL_NOT_FOUND",
          message:
            error instanceof Error
              ? error.message
              : "Proposal not found.",
        },
      });
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      if (!proposalService) {
        res.status(503).json({
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "Proposal generation is not currently available.",
          },
        });

        return;
      }

      const parsed =
        proposalRequestSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_PROPOSAL_REQUEST",
            message:
              "Proposal request validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      const proposal =
        await proposalService.generate(
          parsed.data,
        );

      res.status(201).json({
        success: true,
        status: proposal.status,
        requiresApproval: true,
        proposal,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}