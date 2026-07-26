import {
  Router,
  type RequestHandler,
} from "express";

import type { OrganizationService } from "../../tenancy/OrganizationService";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import { toPublicUser } from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { PlatformSessionRecord } from "../sessions/PlatformSession";
import type { PlatformSessionService } from "../sessions/PlatformSessionService";
import type { PlatformSignupService } from "../signup/PlatformSignupService";
import type { PasswordResetService } from "./PasswordResetService";
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
   * Drives the forgot-password flow. When provided (with `email`), POST
   * /forgot-password and POST /reset-password are exposed.
   */
  passwordReset?: PasswordResetService;

  /**
   * Sends the reset link. Required for /forgot-password to deliver mail.
   */
  email?: PlatformEmailService;

  /**
   * Platform base domain (e.g. "allelitecloud.com"). Used to build reset
   * links on the tenant's own canonical host (`<slug>.<baseDomain>`) —
   * never from the request's Host header, which a caller controls.
   */
  baseDomain?: string;

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

  // Forgot / reset password. Both run within a tenant (you reset a password
  // for a specific organization, resolved from the request's host) and only
  // exist when a reset service is wired.
  if (deps.passwordReset) {
    const passwordReset =
      deps.passwordReset;

    router.post(
      "/forgot-password",
      deps.tenantMiddleware,
      (req, res, next) => {
        const body = (req.body ??
          {}) as { email?: unknown };

        // Respond identically whether or not the address has an account,
        // so this can't be used to discover which emails exist.
        const done = () =>
          res.json({
            ok: true,
            message:
              "If that email has an account, a reset link is on its way.",
          });

        if (
          typeof body.email !==
          "string"
        ) {
          done();

          return;
        }

        passwordReset
          .request(body.email)
          .then(async (result) => {
            if (!result) {
              return;
            }

            // Canonical host from the tenant itself, NOT the request's
            // Host header (which the caller controls — trusting it would
            // let an attacker poison the reset link and steal the token).
            const slug =
              await resolveSlug(
                deps.organizations,
                result.user
                  .organizationId,
              );
            const link =
              buildResetLink(
                deps.baseDomain,
                slug,
                result.token,
              );

            // Best-effort: never let a mail hiccup change the response.
            await deps.email?.sendQuietly(
              {
                to: result.user
                  .email,
                subject:
                  "Reset your password",
                body: resetEmailBody(
                  result.user.name,
                  link,
                ),
              },
            );
          })
          .then(done)
          .catch(next);
      },
    );

    router.post(
      "/reset-password",
      deps.tenantMiddleware,
      (req, res, next) => {
        const body = (req.body ??
          {}) as {
          token?: unknown;
          newPassword?: unknown;
        };

        if (
          typeof body.token !==
            "string" ||
          typeof body.newPassword !==
            "string"
        ) {
          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message:
                "A reset token and new password are required.",
            },
          });

          return;
        }

        passwordReset
          .reset(
            body.token,
            body.newPassword,
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";

            if (
              /invalid|expired|at least 8/i.test(
                message,
              )
            ) {
              res
                .status(400)
                .json({
                  error: {
                    code: "INVALID_RESET",
                    message,
                  },
                });

              return;
            }

            next(error);
          });
      },
    );
  }

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

  router.post(
    "/change-password",
    deps.requireUser,
    (req, res, next) => {
      const auth = (
        req as AuthedRequest
      ).auth;
      const body = (req.body ??
        {}) as {
        currentPassword?: unknown;
        newPassword?: unknown;
      };

      if (
        !auth ||
        typeof body.currentPassword !==
          "string" ||
        typeof body.newPassword !==
          "string"
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message:
              "Current and new passwords are required.",
          },
        });

        return;
      }

      deps.users
        .changePassword(
          auth.user.id,
          body.currentPassword,
          body.newPassword,
        )
        .then(() =>
          res.json({ ok: true }),
        )
        .catch((error: unknown) => {
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
        });
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
 * The tenant's slug, looked up server-side, or undefined. Used to build the
 * canonical reset host — never derived from anything the caller supplies.
 */
async function resolveSlug(
  organizations:
    | OrganizationService
    | undefined,
  organizationId: string,
): Promise<string | undefined> {
  if (!organizations) {
    return undefined;
  }

  try {
    const org =
      await organizations.get(
        organizationId,
      );

    return org.slug;
  } catch {
    return undefined;
  }
}

/**
 * Builds the absolute reset link on the tenant's own canonical host
 * (`<slug>.<baseDomain>`), resolved server-side. Always HTTPS. The request's
 * Host header is deliberately NOT used, so a forged Host can't poison the
 * link and leak the token to an attacker's domain.
 */
function buildResetLink(
  baseDomain: string | undefined,
  slug: string | undefined,
  token: string,
): string {
  const base = (
    baseDomain || "allelitecloud.com"
  ).trim();
  const host = slug
    ? `${slug}.${base}`
    : base;

  return `https://${host}/reset?token=${encodeURIComponent(token)}`;
}

/**
 * The reset email body. Plain text; the link is the whole point.
 */
function resetEmailBody(
  name: string | undefined,
  link: string,
): string {
  const greeting = name
    ? `Hi ${name},`
    : "Hi,";

  return (
    `${greeting}\n\n` +
    "We received a request to reset your password. Open the link below to " +
    "choose a new one. It expires in one hour and can be used once.\n\n" +
    `${link}\n\n` +
    "If you didn't request this, you can safely ignore this email — your " +
    "password won't change.\n\n" +
    "— All Elite Cloud"
  );
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
