import {
  Router,
  type RequestHandler,
} from "express";

import { requireTenant } from "../../tenancy/TenantContext";
import type { PlatformClientService } from "../clients/PlatformClientService";
import type { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import type { PlatformProjectService } from "../projects/PlatformProjectService";
import type { PlatformProposalService } from "../proposals/PlatformProposalService";
import type { PlatformTicketService } from "../support/PlatformTicketService";
import type { ClientUserService } from "./ClientUserService";
import type { PortalSessionService } from "./PortalSessionService";
import {
  createRequirePortalUser,
  PORTAL_COOKIE,
  type PortalRequest,
} from "./requirePortalUser";

export interface PortalRouterDependencies {
  tenantMiddleware: RequestHandler;
  clientUsers: ClientUserService;
  portalSessions: PortalSessionService;
  clients: PlatformClientService;
  projects?: PlatformProjectService;
  invoices?: PlatformInvoiceService;
  tickets?: PlatformTicketService;
  proposals?: PlatformProposalService;
  secureCookie?: boolean;
}

/**
 * The client portal API. Login (behind the tenant middleware, so the org is
 * resolved from the request) and logout are public; every other route runs
 * inside the session's organization and returns ONLY the signed-in client's
 * own data.
 */
export function createPortalRouter(
  deps: PortalRouterDependencies,
): Router {
  const router = Router();

  router.post(
    "/auth/login",
    deps.tenantMiddleware,
    (req, res, next) => {
      const body =
        (req.body as
          | Record<string, unknown>
          | undefined) ?? {};
      const email =
        typeof body.email === "string"
          ? body.email
          : "";
      const password =
        typeof body.password ===
        "string"
          ? body.password
          : "";

      if (!email || !password) {
        res.status(400).json({
          error: {
            code: "INVALID_CREDENTIALS",
            message:
              "Email and password are required.",
          },
        });

        return;
      }

      const organizationId =
        requireTenant()
          .organizationId;

      deps.clientUsers
        .authenticate(
          email,
          password,
        )
        .then((user) =>
          deps.portalSessions
            .createForClientUser({
              id: user.id,
              organizationId,
              clientId:
                user.clientId,
            })
            .then((session) => {
              res.cookie(
                PORTAL_COOKIE,
                session.token,
                {
                  httpOnly: true,
                  sameSite: "lax",
                  secure: Boolean(
                    deps.secureCookie,
                  ),
                  expires: new Date(
                    session.expiresAt,
                  ),
                  path: "/",
                },
              );

              res.json({
                clientId:
                  user.clientId,
                email: user.email,
              });
            }),
        )
        .catch(
          (error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";

            if (
              /invalid email or password/i.test(
                message,
              )
            ) {
              res
                .status(401)
                .json({
                  error: {
                    code: "INVALID_CREDENTIALS",
                    message:
                      "That email or password is incorrect.",
                  },
                });

              return;
            }

            next(error);
          },
        );
    },
  );

  router.post(
    "/auth/logout",
    (req, res, next) => {
      const token =
        readCookieToken(req);

      deps.portalSessions
        .revoke(token ?? "")
        .then(() => {
          res.clearCookie(
            PORTAL_COOKIE,
            { path: "/" },
          );
          res.json({ ok: true });
        })
        .catch(next);
    },
  );

  const guard =
    createRequirePortalUser(
      deps.portalSessions,
    );

  router.post(
    "/auth/change-password",
    guard,
    (req: PortalRequest, res, next) => {
      const body =
        (req.body as
          | Record<string, unknown>
          | undefined) ?? {};
      const current =
        typeof body.currentPassword ===
        "string"
          ? body.currentPassword
          : "";
      const next_ =
        typeof body.newPassword ===
        "string"
          ? body.newPassword
          : "";

      if (!current || !next_) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message:
              "Current and new passwords are required.",
          },
        });

        return;
      }

      deps.clientUsers
        .changePassword(
          req.portal!.clientUserId,
          current,
          next_,
        )
        .then(() =>
          res.json({ ok: true }),
        )
        .catch(
          (error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";

            if (
              /incorrect|at least 8/i.test(
                message,
              )
            ) {
              res.status(400).json({
                error: {
                  code: "INVALID_PASSWORD",
                  message,
                },
              });

              return;
            }

            next(error);
          },
        );
    },
  );

  router.get(
    "/me",
    guard,
    (req: PortalRequest, res, next) => {
      const clientId = req.portal!
        .clientId;

      deps.clients
        .get(clientId)
        .then((client) =>
          res.json({
            client: {
              id: client.id,
              name: client.name,
            },
          }),
        )
        .catch(next);
    },
  );

  router.get(
    "/projects",
    guard,
    (req: PortalRequest, res, next) => {
      if (!deps.projects) {
        res.json({ projects: [] });
        return;
      }

      deps.projects
        .list()
        .then((rows) =>
          res.json({
            projects: rows.filter(
              (r) =>
                r.clientId ===
                req.portal!.clientId,
            ),
          }),
        )
        .catch(next);
    },
  );

  router.get(
    "/invoices",
    guard,
    (req: PortalRequest, res, next) => {
      if (!deps.invoices) {
        res.json({ invoices: [] });
        return;
      }

      deps.invoices
        .list()
        .then((rows) =>
          res.json({
            invoices: rows.filter(
              (r) =>
                r.clientId ===
                req.portal!.clientId,
            ),
          }),
        )
        .catch(next);
    },
  );

  router.get(
    "/tickets",
    guard,
    (req: PortalRequest, res, next) => {
      if (!deps.tickets) {
        res.json({ tickets: [] });
        return;
      }

      deps.tickets
        .list()
        .then((rows) =>
          res.json({
            tickets: rows.filter(
              (r) =>
                r.clientId ===
                req.portal!.clientId,
            ),
          }),
        )
        .catch(next);
    },
  );

  router.get(
    "/proposals",
    guard,
    (req: PortalRequest, res, next) => {
      if (!deps.proposals) {
        res.json({ proposals: [] });
        return;
      }

      deps.proposals
        .list()
        .then((rows) =>
          res.json({
            proposals:
              rows.filter(
                (r) =>
                  r.clientId ===
                  req.portal!
                    .clientId,
              ),
          }),
        )
        .catch(next);
    },
  );

  return router;
}

function readCookieToken(
  req: PortalRequest,
): string | undefined {
  const cookieHeader =
    req.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(
    ";",
  )) {
    const index = part.indexOf("=");

    if (
      index !== -1 &&
      part.slice(0, index).trim() ===
        PORTAL_COOKIE
    ) {
      return decodeURIComponent(
        part.slice(index + 1).trim(),
      );
    }
  }

  return undefined;
}
