import { Router } from "express";
import { z } from "zod";

import type { ProductStatus } from "./ProductStatus";
import { ProductService } from "./ProductService";

const productStatusSchema = z.enum([
  "planning",
  "active",
  "maintenance",
  "archived",
]);

const productRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  name: z
    .string()
    .trim()
    .min(1),

  description: z
    .string()
    .trim()
    .optional(),

  status:
    productStatusSchema.optional(),

  repoUrl: z
    .string()
    .trim()
    .optional(),

  language: z
    .string()
    .trim()
    .optional(),

  version: z
    .string()
    .trim()
    .optional(),

  lastReleaseDate: z
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

const productUpdateSchema =
  productRequestSchema.partial();

/**
 * Creates the engineering (products) management routes.
 */
export function createProductRouter(
  productService: ProductService,
): Router {
  const router = Router();

  /**
   * Returns all products.
   *
   * An optional clientId query parameter limits the result.
   */
  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId.trim()
        : "";

    const products =
      clientId.length > 0
        ? productService.listForClient(
            clientId,
          )
        : productService.list();

    res.json({
      count: products.length,
      products,
    });
  });

  /**
   * Returns one product.
   */
  router.get(
    "/:productId",
    (req, res) => {
      try {
        res.json(
          productService.get(
            req.params.productId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "PRODUCT_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Product not found.",
          },
        });
      }
    },
  );

  /**
   * Records a product.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          productRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PRODUCT_REQUEST",
              message:
                "Product request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const product =
          productService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: product.status,
          product,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates a product.
   */
  router.patch(
    "/:productId",
    (req, res, next) => {
      try {
        const parsed =
          productUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_PRODUCT_UPDATE",
              message:
                "Product update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          productService.get(
            req.params.productId,
          );

        const product =
          productService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as ProductStatus)
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
          status: product.status,
          product,
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
                "PRODUCT_NOT_FOUND",
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
   * Deletes a product.
   */
  router.delete(
    "/:productId",
    (req, res, next) => {
      try {
        productService.delete(
          req.params.productId,
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
                "PRODUCT_NOT_FOUND",
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
