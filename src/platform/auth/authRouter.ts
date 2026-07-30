import { createHash } from "node:crypto";
import {
  Router,
  type RequestHandler,
} from "express";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { LegalAcceptanceService } from "../legal/LegalAcceptanceService";
import type { OrganizationService } from "../../tenancy/OrganizationService";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import { toPublicUser } from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { PlatformSessionRecord } from "../sessions/PlatformSession";
import type { PlatformSessionService } from "../sessions/PlatformSessionService";
import type { PlatformSignupService } from "../signup/PlatformSignupService";
import type { PasswordResetService } from "./PasswordResetService";
import type { AuditService } from "../audit/AuditService";
import {
  RateLimiter,
  rateLimit,
} from "../security/RateLimiter";
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
   * Records Terms/Privacy acceptance evidence at signup. When provided (with
   * published required documents), signup requires affirmative acceptance.
   */
  legalAcceptance?: LegalAcceptanceService;

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
   * Records security audit events (login success/failure, password changes).
   */
  audit?: AuditService;

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

  /**
   * Optional limiter overrides for tests. When omitted, sensible in-memory
   * limiters are created for every sensitive endpoint (login, signup,
   * forgot-password request, reset-password submit, change-password).
   */
  loginLimiter?: RateLimiter;
  loginIpLimiter?: RateLimiter;
  resetLimiter?: RateLimiter;
  signupLimiter?: RateLimiter;
  resetSubmitLimiter?: RateLimiter;
  resetSubmitTokenLimiter?: RateLimiter;
  changePwLimiter?: RateLimiter;
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

  const FIFTEEN_MIN =
    15 * 60 * 1000;
  // Two-tier where it matters:
  //  - login: a per-IP+email bucket (cleared on that account's successful
  //    login so a legitimate user is never locked out) PLUS a wider per-IP
  //    bucket (never cleared) that bounds credential spray across many
  //    accounts even when some succeed.
  //  - reset-submit: a per-IP bucket (bounds token brute-force across many
  //    tokens) PLUS a per-IP+token-fingerprint bucket (bounds hammering one
  //    token). The fingerprint is a SHA-256 of the token — the raw token is
  //    never used as a key, stored, or logged.
  //  - signup: per-IP only. Adding the email to the key would give each probed
  //    address its own bucket, letting an attacker enumerate accounts (via the
  //    "already in use" 409) unbounded; per-IP bounds enumeration and abuse.
  // In-memory fixed windows; correct for the single-process deployment (see
  // the note in RateLimiter.ts and the go-live constraint in 04_SECURITY.md).
  const loginLimiter =
    deps.loginLimiter ??
    new RateLimiter({
      max: 10,
      windowMs: FIFTEEN_MIN,
    });
  const loginIpLimiter =
    deps.loginIpLimiter ??
    new RateLimiter({
      max: 30,
      windowMs: FIFTEEN_MIN,
    });
  const resetLimiter =
    deps.resetLimiter ??
    new RateLimiter({
      max: 5,
      windowMs: FIFTEEN_MIN,
    });
  const signupLimiter =
    deps.signupLimiter ??
    new RateLimiter({
      max: 10,
      windowMs: FIFTEEN_MIN,
    });
  const resetSubmitLimiter =
    deps.resetSubmitLimiter ??
    new RateLimiter({
      max: 10,
      windowMs: FIFTEEN_MIN,
    });
  const resetSubmitTokenLimiter =
    deps.resetSubmitTokenLimiter ??
    new RateLimiter({
      max: 5,
      windowMs: FIFTEEN_MIN,
    });
  const changePwLimiter =
    deps.changePwLimiter ??
    new RateLimiter({
      max: 10,
      windowMs: FIFTEEN_MIN,
    });

  const emailKey = (
    req: Parameters<RequestHandler>[0],
  ): string =>
    String(
      (req.body as { email?: unknown })
        ?.email ?? "",
    )
      .trim()
      .toLowerCase();

  // A non-reversible fingerprint of the reset token so a per-token bucket can
  // exist without the raw token ever becoming a key, being stored, or logged.
  const tokenFingerprint = (
    req: Parameters<RequestHandler>[0],
  ): string => {
    const token = String(
      (req.body as { token?: unknown })
        ?.token ?? "",
    );
    if (!token) return "none";

    return createHash("sha256")
      .update(token)
      .digest("hex")
      .slice(0, 16);
  };

  // Records a throttle event for audit visibility — scope + IP only, never
  // any credential, token, or password. Best-effort (audit may be unwired).
  const auditBlocked = (
    req: Parameters<RequestHandler>[0],
    scope: string,
  ): void => {
    void deps.audit?.record({
      action: "auth.rate_limited",
      actorType: "system",
      outcome: "failure",
      ip: req.ip,
      metadata: { scope },
    });
  };

  const loginRateLimit = rateLimit({
    limiter: loginLimiter,
    scope: "login",
    keyPart: emailKey,
    message:
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    onBlocked: auditBlocked,
  });
  const loginIpRateLimit = rateLimit({
    limiter: loginIpLimiter,
    scope: "login-ip",
    message:
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    onBlocked: auditBlocked,
  });
  const resetRateLimit = rateLimit({
    limiter: resetLimiter,
    scope: "reset",
    keyPart: emailKey,
    message:
      "Too many requests. Please wait a few minutes and try again.",
    onBlocked: auditBlocked,
  });
  const signupRateLimit = rateLimit({
    limiter: signupLimiter,
    scope: "signup",
    message:
      "Too many sign-up attempts. Please wait a few minutes and try again.",
    onBlocked: auditBlocked,
  });
  const resetSubmitIpRateLimit =
    rateLimit({
      limiter: resetSubmitLimiter,
      scope: "reset-submit",
      message:
        "Too many attempts. Please wait a few minutes and try again.",
      onBlocked: auditBlocked,
    });
  const resetSubmitTokenRateLimit =
    rateLimit({
      limiter: resetSubmitTokenLimiter,
      scope: "reset-submit-token",
      keyPart: tokenFingerprint,
      message:
        "Too many attempts. Please wait a few minutes and try again.",
      onBlocked: auditBlocked,
    });
  const changePwRateLimit = rateLimit({
    limiter: changePwLimiter,
    scope: "change-password",
    // Keyed per authenticated user (requireUser runs first), bounding
    // current-password guessing within a hijacked session.
    keyPart: (req) =>
      (req as AuthedRequest).auth?.user
        .id ?? "",
    message:
      "Too many attempts. Please wait a few minutes and try again.",
    onBlocked: auditBlocked,
  });

  // Reconstructs the login limiter key so a successful login can clear that
  // account's failure bucket (never the wider per-IP bucket). Mirrors the key
  // the rateLimit middleware builds: `${scope}:${ip}:${extra}`.
  const clearLoginFailures = (
    req: Parameters<RequestHandler>[0],
    email: string,
  ): void => {
    const ip =
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";
    loginLimiter.reset(
      `login:${ip}:${email
        .trim()
        .toLowerCase()}`,
    );
  };

  // Self-serve onboarding: create an organization + its first owner and
  // (when a session service is wired) log them straight in. Public — it
  // is what creates the tenant, so it runs before any tenant exists.
  if (deps.signup) {
    const signup = deps.signup;

    router.post(
      "/signup",
      signupRateLimit,
      (req, res, next) => {
        const body = (req.body ??
          {}) as {
          organizationName?: unknown;
          slug?: unknown;
          email?: unknown;
          password?: unknown;
          name?: unknown;
          acceptTerms?: unknown;
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

        const legalAcceptance =
          deps.legalAcceptance;

        void (async () => {
          try {
            // Affirmative Terms/Privacy acceptance is required whenever the
            // required documents are published. The checkbox must be an
            // explicit `true` — a missing/false value fails closed.
            if (
              legalAcceptance &&
              (await legalAcceptance.acceptanceRequired()) &&
              body.acceptTerms !== true
            ) {
              res.status(400).json({
                error: {
                  code: "ACCEPTANCE_REQUIRED",
                  message:
                    "You must agree to the Terms of Service and Privacy Policy to continue.",
                },
              });
              return;
            }

            const result = await signup.signup({
              organizationName:
                body.organizationName as string,
              slug:
                typeof body.slug === "string"
                  ? body.slug
                  : undefined,
              ownerEmail: body.email as string,
              ownerPassword: body.password as string,
              ownerName:
                typeof body.name === "string"
                  ? body.name
                  : undefined,
            });

            if (result.session) {
              setSessionCookie(
                res,
                result.session,
                secure,
              );
            }

            // Record acceptance evidence for the exact published versions,
            // inside the new tenant's context. Best-effort: a failed evidence
            // write is logged but never blocks account creation.
            if (legalAcceptance) {
              await runWithTenant(
                {
                  organizationId:
                    result.organization.id,
                },
                () =>
                  legalAcceptance.recordAcceptance({
                    userId: result.owner.id,
                    source: "signup",
                    ip: req.ip ?? null,
                  }),
              ).catch((err: unknown) => {
                console.error(
                  "legal acceptance write failed",
                  err instanceof Error
                    ? err.message
                    : err,
                );
              });
            }

            res.status(201).json({
              organization: {
                id: result.organization.id,
                name: result.organization.name,
                slug: result.organization.slug,
              },
              user: result.owner,
            });
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : "";

            if (
              /already in use|already exists/i.test(
                message,
              )
            ) {
              res.status(409).json({
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
              res.status(400).json({
                error: {
                  code: "INVALID_SIGNUP",
                  message,
                },
              });
              return;
            }

            next(error);
          }
        })();
      },
    );
  }

  router.post(
    "/login",
    loginRateLimit,
    loginIpRateLimit,
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

              // Clear only THIS account's failure bucket, so a legitimate
              // sign-in never leaves the user locked out. The wider per-IP
              // bucket is deliberately left intact to keep bounding spray.
              clearLoginFailures(
                req,
                String(body.email),
              );

              void deps.audit?.record({
                action: "auth.login",
                actorType: "user",
                actorId: user.id,
                actorLabel:
                  user.name ||
                  user.email,
                outcome: "success",
                ip: req.ip,
              });

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
            void deps.audit?.record({
              action:
                "auth.login_failed",
              actorType: "system",
              outcome: "failure",
              ip: req.ip,
              metadata: {
                email: String(
                  body.email,
                )
                  .trim()
                  .toLowerCase(),
              },
            });

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
      resetRateLimit,
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
      resetSubmitIpRateLimit,
      resetSubmitTokenRateLimit,
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
          .then(() => {
            void deps.audit?.record({
              action:
                "auth.password_reset",
              actorType: "user",
              outcome: "success",
              ip: req.ip,
            });

            res.json({ ok: true });
          })
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
    changePwRateLimit,
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
        .then(() => {
          void deps.audit?.record({
            action:
              "auth.password_changed",
            actorType: "user",
            actorId: auth.user.id,
            actorLabel:
              auth.user.name ||
              auth.user.email,
            outcome: "success",
            ip: req.ip,
          });

          res.json({ ok: true });
        })
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
 * Builds the absolute reset link, resolved server-side. Always HTTPS. Points at
 * the base host (`<baseDomain>/reset`) with the tenant slug carried as an `org`
 * query param — the reset page reads it to pre-fill the Organization field.
 *
 * We deliberately do NOT use a per-tenant subdomain (`<slug>.<baseDomain>`):
 * tenant subdomains require wildcard DNS that isn't guaranteed, which would make
 * the link a dead end. The base host always resolves. The request's Host header
 * is still never used, so a forged Host can't poison the link and leak the
 * token; both the host and slug are derived server-side.
 */
function buildResetLink(
  baseDomain: string | undefined,
  slug: string | undefined,
  token: string,
): string {
  const base = (
    baseDomain || "allelitecloud.com"
  ).trim();

  const org = slug
    ? `&org=${encodeURIComponent(slug)}`
    : "";

  return `https://${base}/reset?token=${encodeURIComponent(token)}${org}`;
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
