import { Router } from "express";
import { z } from "zod";

import type { CampaignStatus } from "./CampaignStatus";
import { CampaignService } from "./CampaignService";

const campaignStatusSchema = z.enum([
  "planned",
  "active",
  "paused",
  "completed",
]);

const campaignRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  name: z
    .string()
    .trim()
    .min(1),

  channel: z
    .string()
    .trim()
    .optional(),

  status:
    campaignStatusSchema.optional(),

  audience: z
    .string()
    .trim()
    .optional(),

  budget: z
    .number()
    .nonnegative()
    .optional(),

  spend: z
    .number()
    .nonnegative()
    .optional(),

  leads: z
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

const campaignUpdateSchema =
  campaignRequestSchema.partial();

/**
 * Creates the marketing (campaigns) management routes.
 */
export function createCampaignRouter(
  campaignService: CampaignService,
): Router {
  const router = Router();

  /**
   * Returns all campaigns.
   *
   * An optional clientId query parameter limits the result.
   */
  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId.trim()
        : "";

    const campaigns =
      clientId.length > 0
        ? campaignService.listForClient(
            clientId,
          )
        : campaignService.list();

    res.json({
      count: campaigns.length,
      campaigns,
    });
  });

  /**
   * Returns one campaign.
   */
  router.get(
    "/:campaignId",
    (req, res) => {
      try {
        res.json(
          campaignService.get(
            req.params.campaignId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "CAMPAIGN_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Campaign not found.",
          },
        });
      }
    },
  );

  /**
   * Records a campaign.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          campaignRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_CAMPAIGN_REQUEST",
              message:
                "Campaign request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const campaign =
          campaignService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: campaign.status,
          campaign,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates a campaign.
   */
  router.patch(
    "/:campaignId",
    (req, res, next) => {
      try {
        const parsed =
          campaignUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_CAMPAIGN_UPDATE",
              message:
                "Campaign update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          campaignService.get(
            req.params.campaignId,
          );

        const campaign =
          campaignService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as CampaignStatus)
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
          status: campaign.status,
          campaign,
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
                "CAMPAIGN_NOT_FOUND",
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
   * Deletes a campaign.
   */
  router.delete(
    "/:campaignId",
    (req, res, next) => {
      try {
        campaignService.delete(
          req.params.campaignId,
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
                "CAMPAIGN_NOT_FOUND",
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
