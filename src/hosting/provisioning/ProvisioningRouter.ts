import { Router } from "express";
import { z } from "zod";

import { ProvisioningService } from "./ProvisioningService";

const provisionSchema = z
  .object({
    planId: z
      .string()
      .trim()
      .optional(),
    planSlug: z
      .string()
      .trim()
      .optional(),
    domain: z.string().trim().min(1),
    clientId: z
      .string()
      .trim()
      .optional(),
    brandId: z
      .string()
      .trim()
      .optional(),
    contactEmail: z
      .string()
      .trim()
      .email()
      .optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.planId || data.planSlug,
      ),
    {
      message:
        "A planId or planSlug is required.",
    },
  );

/**
 * Admin route to provision hosting for a customer. The order-triggered
 * (automatic) path reuses the same ProvisioningService.
 */
export function createProvisioningRouter(
  provisioning: ProvisioningService,
): Router {
  const router = Router();

  router.get(
    "/status",
    (_req, res) => {
      res.json({
        available:
          provisioning.isAvailable(),
      });
    },
  );

  router.post(
    "/",
    async (req, res, next) => {
      if (
        !provisioning.isAvailable()
      ) {
        res.status(503).json({
          error: {
            code:
              "PROVISIONING_UNAVAILABLE",
            message:
              "Provisioning is unavailable: WHM is not configured with account-creation access.",
          },
        });

        return;
      }

      const parsed =
        provisionSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_PROVISION",
            message:
              "Provisioning validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      try {
        const result =
          await provisioning.provision(
            parsed.data,
          );

        // The generated cPanel password is delivered ONLY via the
        // customer's welcome email — never returned in the HTTP
        // response, where it could be captured in logs or proxies.
        const {
          temporaryPassword: _password,
          ...safe
        } = result;

        void _password;

        res.status(201).json(safe);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Provisioning failed.";

        // Expected, caller-facing failures (bad plan, missing email,
        // WHM rejection) are 422; anything else bubbles to the handler.
        if (
          message.includes(
            "not found",
          ) ||
          message.includes(
            "required",
          ) ||
          message.includes("WHM")
        ) {
          res.status(422).json({
            error: {
              code:
                "PROVISION_FAILED",
              message,
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
