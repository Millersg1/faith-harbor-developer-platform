import { Router } from "express";
import { z } from "zod";

import type { ClientService } from "../../clients/ClientService";
import type { PaymentService } from "../../payments/PaymentService";
import { HostingOrderService } from "../orders/HostingOrderService";
import { HostingPlanService } from "../plans/HostingPlanService";

const signupSchema = z.object({
  planSlug: z.string().trim().min(1),
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253),
  firstName: z
    .string()
    .trim()
    .max(100)
    .optional(),
  lastName: z
    .string()
    .trim()
    .max(100)
    .optional(),
  email: z.string().trim().email(),
  brandId: z
    .string()
    .trim()
    .optional(),
  billingCycle: z
    .enum(["monthly", "yearly"])
    .optional(),
});

/**
 * A tiny in-memory rate limiter: caps signups per client IP to blunt
 * casual abuse of the public endpoint. Not a substitute for a WAF, but
 * enough to stop a simple flood.
 */
function createRateLimiter(
  maxPerWindow: number,
  windowMs: number,
) {
  const hits = new Map<string, number[]>();

  return (key: string): boolean => {
    const now = Date.now();
    const recent = (
      hits.get(key) ?? []
    ).filter(
      (t) => now - t < windowMs,
    );

    if (recent.length >= maxPerWindow) {
      hits.set(key, recent);
      return false;
    }

    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

/**
 * The PUBLIC storefront API (no authentication): lists active plans and
 * accepts customer signups. A signup creates the client and a hosting
 * order; paying its invoice provisions the account automatically. This
 * is the only customer-facing write path, so it is validated and
 * rate-limited.
 */
export function createPublicStorefrontRouter(
  plans: HostingPlanService,
  orders: HostingOrderService,
  clients: ClientService,
  payments: PaymentService,
): Router {
  const router = Router();

  const allowSignup =
    createRateLimiter(
      5,
      10 * 60 * 1000,
    );

  // Public plan listing for any storefront to render.
  router.get(
    "/hosting/plans",
    (req, res) => {
      const kind = req.query.kind;

      let active =
        plans.listActive();

      if (
        kind === "shared" ||
        kind === "reseller"
      ) {
        active = active.filter(
          (p) => p.kind === kind,
        );
      }

      res.json({
        count: active.length,
        plans: active,
      });
    },
  );

  router.post(
    "/hosting/signup",
    async (req, res, next) => {
      const ip =
        (req.headers[
          "x-forwarded-for"
        ] as string | undefined)
          ?.split(",")[0]
          ?.trim() ||
        req.ip ||
        "unknown";

      if (!allowSignup(ip)) {
        res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message:
              "Too many signups from this address. Please try again shortly.",
          },
        });

        return;
      }

      const parsed =
        signupSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_SIGNUP",
            message:
              "Please provide a plan, a domain, and a valid email.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      const data = parsed.data;

      const plan = plans.getBySlug(
        data.planSlug,
      );

      if (!plan || !plan.active) {
        res.status(404).json({
          error: {
            code: "PLAN_NOT_FOUND",
            message:
              "That plan is not available.",
          },
        });

        return;
      }

      try {
        const client = upsertClient(
          clients,
          data.email,
          [
            data.firstName,
            data.lastName,
          ]
            .filter(Boolean)
            .join(" ")
            .trim(),
          data.brandId,
        );

        const { order, invoice } =
          orders.createOrder({
            clientId: client.id,
            planSlug: data.planSlug,
            domain: data.domain,
            contactEmail: data.email,
            brandId: data.brandId,
            billingCycle:
              data.billingCycle,
          });

        // If payments are connected, hand back a checkout URL so the
        // customer can pay (which auto-provisions). Otherwise the order
        // is captured for the operator to collect on.
        let checkoutUrl:
          | string
          | undefined;

        if (
          payments
            .integrationStatus()
            .connected
        ) {
          try {
            const payment =
              await payments.createCheckout(
                invoice.id,
                "stripe",
              );

            checkoutUrl =
              payment.checkoutUrl;
          } catch {
            // Fall through: order captured without a live link.
          }
        }

        res.status(201).json({
          orderId: order.id,
          status: order.status,
          checkoutUrl,
          message: checkoutUrl
            ? "Continue to secure checkout to activate your hosting."
            : "Thank you! Your order was received and we will email your payment link shortly.",
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

/**
 * Finds a client by email or creates one, so a returning customer is
 * not duplicated.
 */
function upsertClient(
  clients: ClientService,
  email: string,
  name: string,
  brandId: string | undefined,
) {
  const normalized = email
    .trim()
    .toLowerCase();

  const existing = clients
    .list()
    .find(
      (client) =>
        client.email
          ?.trim()
          .toLowerCase() === normalized,
    );

  if (existing) {
    return existing;
  }

  const request: {
    companyName: string;
    primaryContact: string;
    email: string;
    brandId?: string;
  } = {
    companyName: name || normalized,
    primaryContact: name || normalized,
    email: normalized,
  };

  if (brandId) {
    request.brandId = brandId;
  }

  return clients.create(request);
}
