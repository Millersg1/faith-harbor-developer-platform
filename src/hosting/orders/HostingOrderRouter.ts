import { Router } from "express";
import { z } from "zod";

import type { PaymentService } from "../../payments/PaymentService";
import { HostingOrderService } from "./HostingOrderService";

const orderSchema = z
  .object({
    clientId: z.string().trim().min(1),
    planId: z
      .string()
      .trim()
      .optional(),
    planSlug: z
      .string()
      .trim()
      .optional(),
    domain: z.string().trim().min(1),
    contactEmail: z
      .string()
      .trim()
      .email(),
    brandId: z
      .string()
      .trim()
      .optional(),
    billingCycle: z
      .enum(["monthly", "yearly"])
      .optional(),
    provider: z
      .enum(["stripe", "paypal"])
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
 * Admin routes to create hosting orders. Paying the order's invoice
 * (via Stripe/PayPal) auto-provisions the account.
 */
export function createHostingOrderRouter(
  orders: HostingOrderService,
  payments: PaymentService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const list = orders.list();

    res.json({
      count: list.length,
      orders: list,
    });
  });

  router.post(
    "/",
    async (req, res, next) => {
      const parsed =
        orderSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_HOSTING_ORDER",
            message:
              "Hosting order validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      try {
        const { order, invoice } =
          orders.createOrder(
            parsed.data,
          );

        // Optionally create a checkout link so the customer can pay
        // (which then auto-provisions). Best-effort: if payments are
        // not connected, the order + invoice still stand.
        let checkoutUrl:
          | string
          | undefined;

        if (parsed.data.provider) {
          try {
            const payment =
              await payments.createCheckout(
                invoice.id,
                parsed.data.provider,
              );

            checkoutUrl =
              payment.checkoutUrl;
          } catch {
            // Payments may be unconnected; return the order anyway.
          }
        }

        res.status(201).json({
          order,
          invoice,
          checkoutUrl,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "";

        if (
          message.includes(
            "not found",
          ) ||
          message.includes("requires")
        ) {
          res.status(400).json({
            error: {
              code:
                "INVALID_HOSTING_ORDER",
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
