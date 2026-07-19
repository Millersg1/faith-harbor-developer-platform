import { Router } from "express";

import { AutomationService } from "./AutomationService";
import type { AutomationScanner } from "./AutomationScanner";

/**
 * Creates the automation routes.
 *
 * The engine surfaces the drafts it has prepared and lets a human
 * approve or dismiss each one. Approving a draft is the only path
 * that actually sends anything.
 *
 * When a scanner is supplied, a scan can also be triggered on demand
 * (the same work the scheduler runs periodically).
 */
export function createAutomationRouter(
  automationService: AutomationService,
  scanner?: AutomationScanner,
): Router {
  const router = Router();

  /**
   * Returns every draft, or only the pending ones when asked.
   */
  router.get("/", (req, res) => {
    const pendingOnly =
      req.query.status === "pending";

    const drafts = pendingOnly
      ? automationService.listPending()
      : automationService.list();

    res.json({
      count: drafts.length,
      drafts,
    });
  });

  /**
   * Runs a scan for time-based work (for example overdue invoices)
   * and reports how many new drafts were prepared.
   */
  router.post(
    "/scan",
    (_req, res, next) => {
      if (!scanner) {
        res.status(503).json({
          error: {
            code:
              "SCANNER_UNAVAILABLE",
            message:
              "Automated scanning is not available.",
          },
        });

        return;
      }

      Promise.resolve(scanner.run())
        .then((created) => {
          res.json({
            success: true,
            created,
          });
        })
        .catch(next);
    },
  );

  /**
   * Approves a pending draft and carries out its action.
   */
  router.post(
    "/:id/approve",
    (req, res, next) => {
      automationService
        .approve(req.params.id)
        .then((draft) => {
          res.json({
            success: true,
            draft,
          });
        })
        .catch((error: unknown) =>
          handleActionError(
            error,
            res,
            next,
          ),
        );
    },
  );

  /**
   * Dismisses a pending draft without acting on it.
   */
  router.post(
    "/:id/dismiss",
    (req, res, next) => {
      try {
        const draft =
          automationService.dismiss(
            req.params.id,
          );

        res.json({
          success: true,
          draft,
        });
      } catch (error) {
        handleActionError(
          error,
          res,
          next,
        );
      }
    },
  );

  return router;
}

/**
 * Maps expected draft errors to clean 404/409 responses and passes
 * anything unexpected to the shared error handler.
 */
function handleActionError(
  error: unknown,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    message ===
    "Automation draft not found."
  ) {
    res.status(404).json({
      error: {
        code: "DRAFT_NOT_FOUND",
        message,
      },
    });

    return;
  }

  if (
    message.startsWith(
      "Only a pending draft",
    )
  ) {
    res.status(409).json({
      error: {
        code: "DRAFT_NOT_PENDING",
        message,
      },
    });

    return;
  }

  next(error);
}
