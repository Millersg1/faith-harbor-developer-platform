import { Router } from "express";
import { z } from "zod";

import {
  PORTAL_COOKIE,
  readCookie,
} from "../auth/cookies";
import type { InvoiceService } from "../accounting/InvoiceService";
import type { ClientService } from "../clients/ClientService";
import type { HostingAccountService } from "../hosting/HostingAccountService";
import type { WHMClient } from "../hosting/whm/WHMClient";
import type { PaymentService } from "../payments/PaymentService";
import { readProvider } from "../payments/PaymentRouter";
import type { ProjectService } from "../projects/ProjectService";
import { config } from "../config";
import type { TicketService } from "../support/TicketService";

import { ClientUserService } from "./ClientUserService";
import { PortalAuthService } from "./PortalAuthService";
import {
  requirePortalAuth,
  type PortalRequest,
} from "./requirePortalAuth";

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export interface PortalDependencies {
  portalAuth: PortalAuthService;
  clientUsers: ClientUserService;
  clients: ClientService;
  projects: ProjectService;
  invoices: InvoiceService;
  tickets: TicketService;
  payments: PaymentService;
  hosting: HostingAccountService;
  whm?: WHMClient;
}

/**
 * The client portal API. Login and logout are public; every other
 * route derives the client from the session and returns only that
 * client's data.
 */
export function createPortalRouter(
  deps: PortalDependencies,
): Router {
  const router = Router();

  const secureCookie =
    config.NODE_ENV === "production";

  router.post(
    "/auth/login",
    (req, res) => {
      const key = req.ip ?? "unknown";

      if (
        !deps.portalAuth.isLoginAllowed(
          key,
        )
      ) {
        res.status(429).json({
          error: {
            code:
              "TOO_MANY_ATTEMPTS",
            message:
              "Too many attempts. Try again shortly.",
          },
        });

        return;
      }

      const parsed =
        loginSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_CREDENTIALS",
            message:
              "Email and password are required.",
          },
        });

        return;
      }

      const user =
        deps.clientUsers.authenticate(
          parsed.data.email,
          parsed.data.password,
        );

      if (!user) {
        deps.portalAuth.recordFailedAttempt(
          key,
        );

        res.status(401).json({
          error: {
            code:
              "INVALID_CREDENTIALS",
            message:
              "That email or password is incorrect.",
          },
        });

        return;
      }

      deps.portalAuth.clearAttempts(
        key,
      );

      const token =
        deps.portalAuth.createSession(
          user.clientId,
        );

      res.cookie(
        PORTAL_COOKIE,
        token,
        {
          httpOnly: true,
          sameSite: "strict",
          secure: secureCookie,
          path: "/",
          maxAge:
            deps.portalAuth
              .sessionMaxAgeMs,
        },
      );

      res.json(
        buildMe(deps, user.clientId, user.email),
      );
    },
  );

  router.post(
    "/auth/logout",
    (req, res) => {
      const token = readCookie(
        req,
        PORTAL_COOKIE,
      );

      deps.portalAuth.destroySession(
        token,
      );

      res.clearCookie(
        PORTAL_COOKIE,
        { path: "/" },
      );

      res.json({
        success: true,
      });
    },
  );

  // Everything below requires a signed-in client.
  const guard = requirePortalAuth(
    deps.portalAuth,
  );

  router.get(
    "/me",
    guard,
    (req: PortalRequest, res) => {
      res.json(
        buildMe(
          deps,
          req.portalClientId as string,
        ),
      );
    },
  );

  router.get(
    "/projects",
    guard,
    (req: PortalRequest, res) => {
      const projects =
        deps.projects.listForClient(
          req.portalClientId as string,
        );

      res.json({
        count: projects.length,
        projects,
      });
    },
  );

  router.get(
    "/invoices",
    guard,
    (req: PortalRequest, res) => {
      const invoices =
        deps.invoices.listForClient(
          req.portalClientId as string,
        );

      res.json({
        count: invoices.length,
        invoices,
      });
    },
  );

  router.get(
    "/tickets",
    guard,
    (req: PortalRequest, res) => {
      const tickets =
        deps.tickets.listForClient(
          req.portalClientId as string,
        );

      res.json({
        count: tickets.length,
        tickets,
      });
    },
  );

  router.get(
    "/hosting",
    guard,
    (req: PortalRequest, res) => {
      const accounts =
        deps.hosting.listForClient(
          req.portalClientId as string,
        );

      res.json({
        count: accounts.length,
        accounts,
        cpanelEnabled: Boolean(
          deps.whm,
        ),
      });
    },
  );

  // One-click cPanel login: creates a one-time WHM session for the
  // customer's own hosting account and returns the URL.
  router.post(
    "/hosting/:id/cpanel-session",
    guard,
    async (
      req: PortalRequest,
      res,
      next,
    ) => {
      const clientId =
        req.portalClientId as string;

      const account = deps.hosting
        .listForClient(clientId)
        .find(
          (a) =>
            a.id ===
            String(req.params.id),
        );

      // Ownership check: only the account's own client, and only when
      // it has a cPanel username, may open a session.
      if (
        !account ||
        !account.username
      ) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message:
              "Hosting account not found.",
          },
        });

        return;
      }

      if (!deps.whm) {
        res.status(503).json({
          error: {
            code:
              "CPANEL_UNAVAILABLE",
            message:
              "cPanel access is not available right now.",
          },
        });

        return;
      }

      try {
        const url =
          await deps.whm.createUserSession(
            account.username,
          );

        res.json({ url });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/invoices/:id/checkout",
    guard,
    (req: PortalRequest, res, next) => {
      const clientId =
        req.portalClientId as string;

      const invoiceId = String(
        req.params.id,
      );

      let invoice;

      try {
        invoice =
          deps.invoices.get(
            invoiceId,
          );
      } catch {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message:
              "Invoice not found.",
          },
        });

        return;
      }

      // Ownership check: a client can only pay their own invoices.
      if (
        invoice.clientId !== clientId
      ) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message:
              "Invoice not found.",
          },
        });

        return;
      }

      deps.payments
        .createCheckout(
          invoiceId,
          readProvider(req),
        )
        .then((payment) => {
          res.status(201).json({
            success: true,
            provider:
              payment.provider,
            checkoutUrl:
              payment.checkoutUrl,
          });
        })
        .catch((error: unknown) => {
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
                  "PAYMENTS_UNAVAILABLE",
                message:
                  "Online payment is not available right now.",
              },
            });

            return;
          }

          next(error);
        });
    },
  );

  return router;
}

/**
 * Builds the "me" payload: the client's public details and the signed
 * in user's email.
 */
function buildMe(
  deps: PortalDependencies,
  clientId: string,
  email?: string,
) {
  const client =
    deps.clients.get(clientId);

  const payStatus =
    deps.payments.integrationStatus();

  return {
    client: {
      id: client.id,
      companyName:
        client.companyName,
      primaryContact:
        client.primaryContact,
    },
    email,
    payments: {
      stripe: payStatus.stripe,
      paypal: payStatus.paypal,
    },
  };
}
