import {
  Router,
  type RequestHandler,
} from "express";

import type { OrganizationService } from "../../tenancy/OrganizationService";
import { toPublicUser } from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { PlatformSessionRecord } from "../sessions/PlatformSession";
import type { PlatformSessionService } from "../sessions/PlatformSessionService";
import type { PlatformSignupService } from "../signup/PlatformSignupService";
import {
  readToken,
  SESSION_COOKIE,
  type AuthedRequest,
} from "./requireUser";

export interface AuthRouterDependencies {
  users: PlatformUserService;
  sessions: PlatformSessionService;

  /**
   * Optional: when provided, GET /me also returns the caller's
   * organization (id, name, slug) — the UI needs the slug for branding.
   */
  organizations?: OrganizationService;

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
   * Self-serve org onboarding. When provided, POST /signup is exposed.
   */
  signup?: PlatformSignupService;

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

  const secure =
    deps.secureCookie ?? false;

  // Self-serve onboarding: create an organization + its first owner and
  // (when a session service is wired) log them straight in. Public — it
  // is what creates the tenant, so it runs before any tenant exists.
  if (deps.signup) {
    const signup = deps.signup;

    router.post(
      "/signup",
      (req, res, next) => {
        const body = (req.body ??
          {}) as {
          organizationName?: unknown;
          slug?: unknown;
          email?: unknown;
          password?: unknown;
          name?: unknown;
        };

        if (
          typeof body.organizationName !==
            "string" ||
          typeof body.email !==
            "string" ||
          typeof body.password !==
            "string"
        ) {
          res.status(400).json({
            error: {
              code: "INVALID_SIGNUP",
              message:
                "Organization name, email, and password are required.",
            },
          });

          return;
        }

        signup
          .signup({
            organizationName:
              body.organizationName,
            slug:
              typeof body.slug ===
              "string"
                ? body.slug
                : undefined,
            ownerEmail: body.email,
            ownerPassword:
              body.password,
            ownerName:
              typeof body.name ===
              "string"
                ? body.name
                : undefined,
          })
          .then((result) => {
            if (result.session) {
              setSessionCookie(
                res,
                result.session,
                secure,
              );
            }

            res.status(201).json({
              organization: {
                id: result
                  .organization.id,
                name: result
                  .organization
                  .name,
                slug: result
                  .organization
                  .slug,
              },
              user: result.owner,
            });
          })
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /already in use|already exists/i.test(
                  message,
                )
              ) {
                res
                  .status(409)
                  .json({
                    error: {
                      code: "CONFLICT",
                      message,
                    },
                  });

                return;
              }

              if (
                /required|valid|at least|slug|name|password|email/i.test(
                  message,
                )
              ) {
                res
                  .status(400)
                  .json({
                    error: {
                      code: "INVALID_SIGNUP",
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
  }

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
              setSessionCookie(
                res,
                session,
                secure,
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

      if (
        !deps.organizations ||
        !auth
      ) {
        res.json({
          user: auth?.user,
        });

        return;
      }

      deps.organizations
        .get(
          auth.session
            .organizationId,
        )
        .then((org) =>
          res.json({
            user: auth.user,
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
            },
          }),
        )
        .catch(() =>
          res.json({
            user: auth.user,
          }),
        );
    },
  );

  return router;
}

/**
 * Sets the httpOnly session cookie from a session record.
 */
function setSessionCookie(
  res: Parameters<RequestHandler>[1],
  session: PlatformSessionRecord,
  secure: boolean,
): void {
  res.cookie(
    SESSION_COOKIE,
    session.token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      expires: new Date(
        session.expiresAt,
      ),
      path: "/",
    },
  );
}
