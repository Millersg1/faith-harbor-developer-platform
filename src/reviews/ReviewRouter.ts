import { Router } from "express";
import { z } from "zod";

import { ReviewService } from "./ReviewService";

const profileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1),
  reviewUrl: z
    .string()
    .trim()
    .min(1),
  googlePlaceId: z
    .string()
    .trim()
    .optional(),
});

const requestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1),
  customers: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1),
        email: z
          .string()
          .trim()
          .min(1),
      }),
    )
    .min(1),
});

const replySchema = z.object({
  reply: z
    .string()
    .trim()
    .min(1),
});

/**
 * Creates the reviews routes.
 */
export function createReviewRouter(
  reviewService: ReviewService,
): Router {
  const router = Router();

  router.get(
    "/status",
    (_req, res) => {
      res.json(
        reviewService.integrationStatus(),
      );
    },
  );

  router.get(
    "/profiles",
    (_req, res) => {
      const profiles =
        reviewService.listProfiles();

      res.json({
        count: profiles.length,
        profiles,
      });
    },
  );

  router.get(
    "/profiles/:clientId",
    (req, res) => {
      const profile =
        reviewService.getProfile(
          req.params.clientId,
        );

      if (!profile) {
        res.status(404).json({
          error: {
            code:
              "PROFILE_NOT_FOUND",
            message:
              "No review profile is set for this client.",
          },
        });

        return;
      }

      res.json(profile);
    },
  );

  router.put(
    "/profiles/:clientId",
    (req, res, next) => {
      const parsed =
        profileSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_PROFILE",
            message:
              "Review profile validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      try {
        const profile =
          reviewService.setProfile({
            clientId:
              req.params.clientId,
            ...parsed.data,
          });

        res.json(profile);
      } catch (error) {
        handleError(
          error,
          res,
          next,
        );
      }
    },
  );

  router.post(
    "/requests",
    (req, res, next) => {
      const parsed =
        requestSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_REQUEST",
            message:
              "Review request validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      try {
        const result =
          reviewService.requestReviews(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          ...result,
        });
      } catch (error) {
        handleError(
          error,
          res,
          next,
        );
      }
    },
  );

  router.get(
    "/:clientId/reviews",
    (req, res) => {
      const reviews =
        reviewService.listReviews(
          req.params.clientId,
        );

      res.json({
        count: reviews.length,
        reviews,
      });
    },
  );

  router.post(
    "/:clientId/sync",
    (req, res, next) => {
      reviewService
        .syncReviews(
          req.params.clientId,
        )
        .then((imported) => {
          res.json({
            success: true,
            imported,
          });
        })
        .catch(next);
    },
  );

  router.post(
    "/:clientId/reviews/:reviewId/reply",
    (req, res, next) => {
      const parsed =
        replySchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_REPLY",
            message:
              "A reply is required.",
          },
        });

        return;
      }

      reviewService
        .postReply(
          req.params.clientId,
          req.params.reviewId,
          parsed.data.reply,
        )
        .then(() => {
          res.json({
            success: true,
          });
        })
        .catch((error: unknown) =>
          handleError(
            error,
            res,
            next,
          ),
        );
    },
  );

  return router;
}

function handleError(
  error: unknown,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    message.includes("not found") ||
    message.includes("does not exist")
  ) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message,
      },
    });

    return;
  }

  if (
    message.includes(
      "not connected",
    )
  ) {
    res.status(503).json({
      error: {
        code:
          "GOOGLE_NOT_CONNECTED",
        message,
      },
    });

    return;
  }

  if (
    message.includes("requires") ||
    message.includes("before requesting") ||
    message.includes("no Google Business Profile")
  ) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message,
      },
    });

    return;
  }

  next(error);
}
