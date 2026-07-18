import { Router } from "express";
import { z } from "zod";

import type { InvoiceStatus } from "./InvoiceStatus";
import { InvoiceService } from "./InvoiceService";

const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
]);

const lineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1),

  quantity: z
    .number()
    .nonnegative(),

  unitPrice: z
    .number()
    .nonnegative(),
});

const invoiceRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1),

  projectId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  number: z
    .string()
    .trim()
    .min(1)
    .optional(),

  status:
    invoiceStatusSchema.optional(),

  currency: z
    .string()
    .trim()
    .min(1)
    .optional(),

  lineItems: z
    .array(lineItemSchema)
    .min(1),

  issueDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  dueDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  paidDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  notes: z
    .string()
    .trim()
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

const invoiceUpdateSchema =
  invoiceRequestSchema.partial();

/**
 * Creates the invoice management routes.
 */
export function createInvoiceRouter(
  invoiceService: InvoiceService,
): Router {
  const router = Router();

  /**
   * Returns all invoices.
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

    const invoices =
      clientId.length > 0
        ? invoiceService.listForClient(
            clientId,
          )
        : invoiceService.list();

    res.json({
      count: invoices.length,
      invoices,
    });
  });

  /**
   * Returns one invoice.
   */
  router.get(
    "/:invoiceId",
    (req, res) => {
      try {
        res.json(
          invoiceService.get(
            req.params.invoiceId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "INVOICE_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Invoice not found.",
          },
        });
      }
    },
  );

  /**
   * Creates an invoice.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          invoiceRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_INVOICE_REQUEST",
              message:
                "Invoice request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const invoice =
          invoiceService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: invoice.status,
          invoice,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates an existing invoice.
   */
  router.patch(
    "/:invoiceId",
    (req, res, next) => {
      try {
        const parsed =
          invoiceUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_INVOICE_UPDATE",
              message:
                "Invoice update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          invoiceService.get(
            req.params.invoiceId,
          );

        const invoice =
          invoiceService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as InvoiceStatus)
                : existing.status,

            lineItems:
              parsed.data.lineItems
                ? parsed.data.lineItems
                : existing.lineItems,

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
          status: invoice.status,
          invoice,
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
                "INVOICE_NOT_FOUND",
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
   * Deletes an invoice.
   */
  router.delete(
    "/:invoiceId",
    (req, res, next) => {
      try {
        invoiceService.delete(
          req.params.invoiceId,
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
                "INVOICE_NOT_FOUND",
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
