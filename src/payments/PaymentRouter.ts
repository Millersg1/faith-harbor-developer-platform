import {
  Router,
  type Request,
  type Response,
} from "express";

import { PaymentService } from "./PaymentService";

/**
 * Creates the authenticated payment routes.
 */
export function createPaymentRouter(
  paymentService: PaymentService,
): Router {
  const router = Router();

  router.get(
    "/status",
    (_req, res) => {
      res.json(
        paymentService.integrationStatus(),
      );
    },
  );

  router.get("/", (_req, res) => {
    const payments =
      paymentService.list();

    res.json({
      count: payments.length,
      payments,
    });
  });

  router.post(
    "/invoices/:invoiceId/checkout",
    (req, res, next) => {
      const provider =
        readProvider(req);

      paymentService
        .createCheckout(
          String(
            req.params.invoiceId,
          ),
          provider,
        )
        .then((payment) => {
          res.status(201).json({
            success: true,
            provider:
              payment.provider,
            checkoutUrl:
              payment.checkoutUrl,
            payment,
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

/**
 * Reads the requested provider from the query or body, defaulting to
 * Stripe. Any value other than "paypal" is treated as Stripe.
 */
export function readProvider(
  req: import("express").Request,
): "stripe" | "paypal" {
  const raw =
    (typeof req.query.provider ===
    "string"
      ? req.query.provider
      : undefined) ??
    (typeof (
      req.body as {
        provider?: unknown;
      }
    )?.provider === "string"
      ? (
          req.body as {
            provider: string;
          }
        ).provider
      : undefined);

  return raw === "paypal"
    ? "paypal"
    : "stripe";
}

/**
 * Handles the PayPal payer return: captures the order and redirects
 * back to the app. Public (PayPal redirects the browser here).
 */
export function handlePayPalReturn(
  paymentService: PaymentService,
  baseUrl: string,
) {
  return (
    req: Request,
    res: Response,
  ): void => {
    const orderId =
      typeof req.query.token ===
      "string"
        ? req.query.token
        : "";

    const home = baseUrl || "/";

    if (!orderId) {
      res.redirect(
        `${home}/?payment=failed`,
      );

      return;
    }

    paymentService
      .capturePayPalReturn(orderId)
      .then((outcome) => {
        res.redirect(
          outcome.completed
            ? `${home}/?payment=success`
            : `${home}/?payment=failed`,
        );
      })
      .catch(() => {
        res.redirect(
          `${home}/?payment=failed`,
        );
      });
  };
}

/**
 * Handles the public Stripe webhook. Mounted before the auth gate,
 * with a raw body so the signature can be verified.
 */
export function handleStripeWebhook(
  paymentService: PaymentService,
) {
  return (
    req: Request,
    res: Response,
  ): void => {
    const rawBody = Buffer.isBuffer(
      req.body,
    )
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

    const signature =
      req.header("stripe-signature");

    const result =
      paymentService.handleWebhook(
        rawBody,
        signature,
      );

    if (!result.handled) {
      res.status(400).json({
        error: {
          code: "WEBHOOK_REJECTED",
          message:
            result.reason ??
            "The webhook could not be processed.",
        },
      });

      return;
    }

    res.json({ received: true });
  };
}

function handleError(
  error: unknown,
  res: Response,
  next: import("express").NextFunction,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    message.includes(
      "not configured",
    )
  ) {
    res.status(503).json({
      error: {
        code:
          "STRIPE_NOT_CONFIGURED",
        message,
      },
    });

    return;
  }

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
      "already paid",
    ) ||
    message.includes("no balance") ||
    message.includes("APP_URL")
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
