import {
  Router,
  type RequestHandler,
} from "express";

import { toPublicUser } from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { PlatformSessionService } from "../sessions/PlatformSessionService";
import {
  readToken,
  SESSION_COOKIE,
  type AuthedRequest,
} from "./requireUser";

export interface AuthRouterDependencies {
  users: PlatformUserService;
  sessions: PlatformSessionService;

  /**
   * Resolves the tenant for the login request (login happens within a
   * tenant — you sign in to a specific organization).
   */
  tenantMiddleware: RequestHandler;

  /**
   * Guards the authenticated routes (/me).
   */
  requireUser: RequestHandler;

  /**
   * Whether to mark the session cookie Secure (HTTPS only). True in
   * production.
   */
  secureCookie?: boolean;
}

/**
 * The authentication routes: log in (within a tenant), log out, and read
 * the current user. The session token is delivered as an httpOnly cookie
 * so page JavaScript can't read it.
 */
export function createAuthRouter(
  deps: AuthRouterDependencies,
): Router {
  const router = Router();

  router.post(
    "/login",
    deps.tenantMiddleware,
    (req, res, next) => {
      const body = (req.body ??
        {}) as {
        email?: unknown;
        password?: unknown;
      };

      if (
        typeof body.email !==
          "string" ||
        typeof body.password !==
          "string"
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_LOGIN",
            message:
              "Email and password are required.",
          },
        });

        return;
      }

      deps.users
        .authenticate(
          body.email,
          body.password,
        )
        .then((user) =>
          deps.sessions
            .createForUser(user)
            .then((session) => {
              res.cookie(
                SESSION_COOKIE,
                session.token,
                {
                  httpOnly: true,
                  sameSite: "lax",
                  secure:
                    deps.secureCookie ??
                    false,
                  expires: new Date(
                    session.expiresAt,
                  ),
                  path: "/",
                },
              );

              res.json({
                user: toPublicUser(
                  user,
                ),
              });
            }),
        )
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "";

          // Authentication failures are 401; unexpected errors bubble.
          if (
            /invalid|suspended/i.test(
              message,
            )
          ) {
            res.status(401).json({
              error: {
                code: "INVALID_LOGIN",
                message,
              },
            });

            return;
          }

          next(error);
        });
    },
  );

  router.post(
    "/logout",
    (req, res, next) => {
      const token = readToken(req);

      Promise.resolve(
        token
          ? deps.sessions.revoke(
              token,
            )
          : undefined,
      )
        .then(() => {
          res.clearCookie(
            SESSION_COOKIE,
            { path: "/" },
          );

          res.json({ ok: true });
        })
        .catch(next);
    },
  );

  router.get(
    "/me",
    deps.requireUser,
    (req, res) => {
      const auth = (
        req as AuthedRequest
      ).auth;

      res.json({
        user: auth?.user,
      });
    },
  );

  return router;
}
