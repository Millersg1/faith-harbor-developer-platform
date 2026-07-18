import { Router } from "express";
import { z } from "zod";

import type { HostingAccountStatus } from "./HostingAccountStatus";
import { HostingAccountService } from "./HostingAccountService";
import type { HostingAssistantService } from "./assistant/HostingAssistantService";
import type { WHMClient } from "./whm/WHMClient";

const hostingStatusSchema = z.enum([
  "pending",
  "active",
  "suspended",
  "cancelled",
]);

const hostingAccountRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  brand: z
    .string()
    .trim()
    .optional(),

  domain: z
    .string()
    .trim()
    .min(1),

  username: z
    .string()
    .trim()
    .min(1),

  plan: z
    .string()
    .trim()
    .optional(),

  status:
    hostingStatusSchema.optional(),

  server: z
    .string()
    .trim()
    .optional(),

  ipAddress: z
    .string()
    .trim()
    .optional(),

  diskUsedMb: z
    .number()
    .nonnegative()
    .optional(),

  diskLimitMb: z
    .number()
    .nonnegative()
    .optional(),

  notes: z
    .string()
    .trim()
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

const hostingAccountUpdateSchema =
  hostingAccountRequestSchema.partial();

/**
 * Creates the hosting management routes.
 *
 * Local hosting account records are always available. Live WHM
 * observation endpoints require a configured, read-only WHM client
 * and otherwise respond with 503.
 */
const assistRequestSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1),

  ticketId: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

export function createHostingRouter(
  hostingService: HostingAccountService,
  whmClient?: WHMClient,
  assistantService?: HostingAssistantService,
): Router {
  const router = Router();

  /**
   * Runs the AI hosting assistant against one account,
   * optionally in the context of a support ticket.
   */
  router.post(
    "/assist",
    (req, res, next) => {
      if (!assistantService) {
        res.status(503).json({
          error: {
            code:
              "HOSTING_ASSISTANT_UNAVAILABLE",
            message:
              "The hosting assistant is not available.",
          },
        });

        return;
      }

      const parsed =
        assistRequestSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_ASSIST_REQUEST",
            message:
              "Assist request validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      assistantService
        .assess(
          parsed.data.accountId,
          parsed.data.ticketId,
        )
        .then((assessment) => {
          res.json({ assessment });
        })
        .catch(
          (error: unknown) => {
            if (
              error instanceof Error &&
              error.message.includes(
                "was not found",
              )
            ) {
              res
                .status(404)
                .json({
                  error: {
                    code:
                      "HOSTING_ACCOUNT_NOT_FOUND",
                    message:
                      error.message,
                  },
                });

              return;
            }

            next(error);
          },
        );
    },
  );

  /**
   * Returns all hosting accounts.
   *
   * An optional clientId query parameter limits the result.
   */
  router.get(
    "/accounts",
    (req, res) => {
      const clientId =
        typeof req.query.clientId ===
        "string"
          ? req.query.clientId.trim()
          : "";

      const brand =
        typeof req.query.brand ===
        "string"
          ? req.query.brand.trim()
          : "";

      let accounts =
        clientId.length > 0
          ? hostingService.listForClient(
              clientId,
            )
          : hostingService.list();

      if (brand.length > 0) {
        accounts =
          accounts.filter(
            (account) =>
              account.brand ===
              brand,
          );
      }

      res.json({
        count: accounts.length,
        accounts,
      });
    },
  );

  /**
   * Returns one hosting account.
   */
  router.get(
    "/accounts/:accountId",
    (req, res) => {
      try {
        res.json(
          hostingService.get(
            req.params.accountId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "HOSTING_ACCOUNT_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Hosting account not found.",
          },
        });
      }
    },
  );

  /**
   * Records a hosting account.
   */
  router.post(
    "/accounts",
    (req, res, next) => {
      try {
        const parsed =
          hostingAccountRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_HOSTING_ACCOUNT_REQUEST",
              message:
                "Hosting account request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const account =
          hostingService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: account.status,
          account,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates a hosting account record.
   */
  router.patch(
    "/accounts/:accountId",
    (req, res, next) => {
      try {
        const parsed =
          hostingAccountUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_HOSTING_ACCOUNT_UPDATE",
              message:
                "Hosting account update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          hostingService.get(
            req.params.accountId,
          );

        const account =
          hostingService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as HostingAccountStatus)
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
          status: account.status,
          account,
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
                "HOSTING_ACCOUNT_NOT_FOUND",
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
   * Deletes a hosting account record.
   *
   * Removes only the Faith Harbor OS record, never the live account.
   */
  router.delete(
    "/accounts/:accountId",
    (req, res, next) => {
      try {
        hostingService.delete(
          req.params.accountId,
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
                "HOSTING_ACCOUNT_NOT_FOUND",
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
   * Reports whether the live WHM connection is configured.
   */
  router.get(
    "/whm",
    (_req, res) => {
      res.json({
        configured:
          Boolean(whmClient),
      });
    },
  );

  /**
   * Returns live server load from WHM.
   */
  router.get(
    "/whm/status",
    (_req, res, next) => {
      if (!whmClient) {
        res.status(503).json({
          error: {
            code:
              "WHM_NOT_CONFIGURED",
            message:
              "The WHM connection is not configured.",
          },
        });

        return;
      }

      whmClient
        .serverStatus()
        .then((serverStatus) => {
          res.json({
            serverStatus,
          });
        })
        .catch(next);
    },
  );

  /**
   * Returns live hosting accounts from WHM.
   */
  router.get(
    "/whm/accounts",
    (_req, res, next) => {
      if (!whmClient) {
        res.status(503).json({
          error: {
            code:
              "WHM_NOT_CONFIGURED",
            message:
              "The WHM connection is not configured.",
          },
        });

        return;
      }

      whmClient
        .listAccounts()
        .then((accounts) => {
          res.json({
            count: accounts.length,
            accounts,
          });
        })
        .catch(next);
    },
  );

  return router;
}
