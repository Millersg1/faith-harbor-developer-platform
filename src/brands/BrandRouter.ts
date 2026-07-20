import { Router } from "express";
import { z } from "zod";

import { BrandService } from "./BrandService";

const brandSchema = z.object({
  name: z.string().trim().min(1),
  domain: z
    .string()
    .trim()
    .optional(),
  fromEmail: z
    .string()
    .trim()
    .optional(),
  emailSignature: z
    .string()
    .optional(),
});

/**
 * Creates the brand routes.
 */
export function createBrandRouter(
  brandService: BrandService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const brands =
      brandService.list();

    res.json({
      count: brands.length,
      brands,
    });
  });

  router.post(
    "/",
    (req, res, next) => {
      const parsed =
        brandSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_BRAND",
            message:
              "A brand name is required.",
          },
        });

        return;
      }

      try {
        res.status(201).json(
          brandService.create(
            parsed.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id",
    (req, res, next) => {
      const parsed =
        brandSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_BRAND",
            message:
              "A brand name is required.",
          },
        });

        return;
      }

      try {
        res.json(
          brandService.update(
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
                "BRAND_NOT_FOUND",
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
      brandService.delete(
        req.params.id,
      );

      res.json({ success: true });
    },
  );

  return router;
}
