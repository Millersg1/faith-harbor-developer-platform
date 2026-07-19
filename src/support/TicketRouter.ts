import { Router } from "express";
import { z } from "zod";

import type { TicketPriority } from "./TicketPriority";
import type { TicketStatus } from "./TicketStatus";
import { TicketService } from "./TicketService";

const ticketStatusSchema = z.enum([
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
]);

const ticketPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);

const ticketRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1),

  projectId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  hostingAccountId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  number: z
    .string()
    .trim()
    .min(1)
    .optional(),

  subject: z
    .string()
    .trim()
    .min(1),

  description: z
    .string()
    .trim()
    .optional(),

  status:
    ticketStatusSchema.optional(),

  priority:
    ticketPrioritySchema.optional(),

  assignee: z
    .string()
    .trim()
    .optional(),

  resolution: z
    .string()
    .trim()
    .optional(),

  resolvedDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

const ticketUpdateSchema =
  ticketRequestSchema.partial();

/**
 * Creates the support ticket management routes.
 */
export function createTicketRouter(
  ticketService: TicketService,
): Router {
  const router = Router();

  /**
   * Returns all tickets.
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

    const tickets =
      clientId.length > 0
        ? ticketService.listForClient(
            clientId,
          )
        : ticketService.list();

    res.json({
      count: tickets.length,
      tickets,
    });
  });

  /**
   * Returns one ticket.
   */
  router.get(
    "/:ticketId",
    (req, res) => {
      try {
        res.json(
          ticketService.get(
            req.params.ticketId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "TICKET_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Ticket not found.",
          },
        });
      }
    },
  );

  /**
   * Opens a ticket.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          ticketRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_TICKET_REQUEST",
              message:
                "Ticket request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const ticket =
          ticketService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: ticket.status,
          ticket,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates an existing ticket.
   */
  router.patch(
    "/:ticketId",
    (req, res, next) => {
      try {
        const parsed =
          ticketUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_TICKET_UPDATE",
              message:
                "Ticket update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          ticketService.get(
            req.params.ticketId,
          );

        const ticket =
          ticketService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as TicketStatus)
                : existing.status,

            priority:
              parsed.data.priority
                ? (parsed.data
                    .priority as TicketPriority)
                : existing.priority,

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
          status: ticket.status,
          ticket,
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
                "TICKET_NOT_FOUND",
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
   * Deletes a ticket.
   */
  router.delete(
    "/:ticketId",
    (req, res, next) => {
      try {
        ticketService.delete(
          req.params.ticketId,
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
                "TICKET_NOT_FOUND",
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
