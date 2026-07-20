import { Router } from "express";
import { z } from "zod";

import { HostingPlanService } from "./HostingPlanService";

const specsSchema = z.object({
  storageMb: z.number().int().min(0),
  bandwidthGb: z.number().int().min(0),
  websites: z.number().int().min(-1),
  emailAccounts: z.number().int().min(0),
  mysqlDatabases: z
    .number()
    .int()
    .min(0),
});

const planSchema = z.object({
  kind: z
    .enum(["shared", "reseller"])
    .optional(),
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  description: z
    .string()
    .trim()
    .optional(),
  priceMonthlyCents: z
    .number()
    .int()
    .min(0),
  priceYearlyCents: z
    .number()
    .int()
    .min(0)
    .optional(),
  specs: specsSchema,
  features: z
    .array(z.string())
    .optional(),
  whmPackage: z
    .string()
    .trim()
    .optional(),
  popular: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z
    .number()
    .int()
    .optional(),
});

/**
 * Creates the hosting-plan management routes.
 */
export function createHostingPlanRouter(
  planService: HostingPlanService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const plans =
      planService.list();

    res.json({
      count: plans.length,
      plans,
    });
  });

  router.get(
    "/:id",
    (req, res) => {
      const plan = planService.get(
        req.params.id,
      );

      if (!plan) {
        res.status(404).json({
          error: {
            code:
              "HOSTING_PLAN_NOT_FOUND",
            message:
              "Hosting plan not found.",
          },
        });

        return;
      }

      res.json(plan);
    },
  );

  router.post("/", (req, res) => {
    const parsed =
      planSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_HOSTING_PLAN",
          message:
            "Hosting plan validation failed.",
          details:
            parsed.error.flatten(),
        },
      });

      return;
    }

    res.status(201).json(
      planService.create(parsed.data),
    );
  });

  router.put(
    "/:id",
    (req, res, next) => {
      const parsed =
        planSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_HOSTING_PLAN",
            message:
              "Hosting plan validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      try {
        res.json(
          planService.update(
            req.params.id,
            parsed.data,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "";

        if (
          message.includes(
            "not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "HOSTING_PLAN_NOT_FOUND",
              message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  router.delete(
    "/:id",
    (req, res) => {
      planService.delete(
        req.params.id,
      );

      res.json({ success: true });
    },
  );

  return router;
}
