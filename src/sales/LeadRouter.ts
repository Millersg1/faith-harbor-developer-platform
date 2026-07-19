import { Router } from "express";
import { z } from "zod";

import type { LeadStatus } from "./LeadStatus";
import { LeadService } from "./LeadService";

const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

const leadRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  name: z
    .string()
    .trim()
    .min(1),

  company: z
    .string()
    .trim()
    .optional(),

  email: z
    .string()
    .trim()
    .optional(),

  phone: z
    .string()
    .trim()
    .optional(),

  source: z
    .string()
    .trim()
    .optional(),

  campaignId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  serviceInterest: z
    .string()
    .trim()
    .optional(),

  estimatedValue: z
    .number()
    .nonnegative()
    .optional(),

  status:
    leadStatusSchema.optional(),

  owner: z
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

const leadUpdateSchema =
  leadRequestSchema.partial();

/**
 * Creates the sales (leads) management routes.
 */
export function createLeadRouter(
  leadService: LeadService,
): Router {
  const router = Router();

  /**
   * Returns all leads.
   *
   * An optional clientId query parameter limits the result.
   */
  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId.trim()
        : "";

    const campaignId =
      typeof req.query.campaignId ===
      "string"
        ? req.query.campaignId.trim()
        : "";

    let leads =
      clientId.length > 0
        ? leadService.listForClient(
            clientId,
          )
        : leadService.list();

    if (campaignId.length > 0) {
      leads =
        leadService.listForCampaign(
          campaignId,
        );
    }

    res.json({
      count: leads.length,
      leads,
    });
  });

  /**
   * Returns one lead.
   */
  router.get(
    "/:leadId",
    (req, res) => {
      try {
        res.json(
          leadService.get(
            req.params.leadId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "LEAD_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Lead not found.",
          },
        });
      }
    },
  );

  /**
   * Records a lead.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          leadRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_LEAD_REQUEST",
              message:
                "Lead request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const lead =
          leadService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: lead.status,
          lead,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Converts a lead into a client (Sales -> Client Services).
   */
  router.post(
    "/:leadId/convert",
    (req, res, next) => {
      try {
        const result =
          leadService.convertToClient(
            req.params.leadId,
          );

        res.status(201).json({
          success: true,
          client: result.client,
          lead: result.lead,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The lead could not be converted.";

        if (
          message.includes(
            "was not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "LEAD_NOT_FOUND",
              message,
            },
          });

          return;
        }

        if (
          message.includes(
            "already linked",
          )
        ) {
          res.status(409).json({
            error: {
              code:
                "LEAD_ALREADY_CONVERTED",
              message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  /**
   * Updates a lead.
   */
  router.patch(
    "/:leadId",
    (req, res, next) => {
      try {
        const parsed =
          leadUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_LEAD_UPDATE",
              message:
                "Lead update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          leadService.get(
            req.params.leadId,
          );

        const lead =
          leadService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as LeadStatus)
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
          status: lead.status,
          lead,
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
                "LEAD_NOT_FOUND",
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
   * Deletes a lead.
   */
  router.delete(
    "/:leadId",
    (req, res, next) => {
      try {
        leadService.delete(
          req.params.leadId,
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
                "LEAD_NOT_FOUND",
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
