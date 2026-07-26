import {
  readdir,
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  Router,
  type RequestHandler,
  type Response,
} from "express";

import type { OrganizationService } from "../../tenancy/OrganizationService";
import { toPublicAdmin } from "./PlatformAdmin";
import type { PlatformAdminService } from "./PlatformAdminService";
import type { PlatformAdminSessionService } from "./PlatformAdminSessionService";
import {
  ADMIN_COOKIE,
  readAdminToken,
  type AdminedRequest,
} from "./requirePlatformAdmin";

export interface AdminRouterDependencies {
  admins: PlatformAdminService;
  adminSessions: PlatformAdminSessionService;
  organizations: OrganizationService;
  requireAdmin: RequestHandler;
  secureCookie?: boolean;

  /**
   * Directory holding the living project documentation (the /docs markdown).
   * When set, the admin console can browse it read-only.
   */
  docsDir?: string;
}

/**
 * The platform-administration API (All Elite Cloud). Login is public;
 * everything else requires an admin session. These routes read and act
 * ACROSS all organizations — the only place in the platform that does.
 */
export function createAdminRouter(
  deps: AdminRouterDependencies,
): Router {
  const router = Router();
  const secure =
    deps.secureCookie ?? false;

  router.post(
    "/login",
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

      deps.admins
        .authenticate(
          body.email,
          body.password,
        )
        .then((admin) =>
          deps.adminSessions
            .createForAdmin(admin)
            .then((session) => {
              setCookie(
                res,
                session.token,
                new Date(
                  session.expiresAt,
                ),
                secure,
              );
              res.json({
                admin:
                  toPublicAdmin(
                    admin,
                  ),
              });
            }),
        )
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "";
          if (
            /invalid/i.test(message)
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
      const token =
        readAdminToken(req);
      Promise.resolve(
        token
          ? deps.adminSessions.revoke(
              token,
            )
          : undefined,
      )
        .then(() => {
          res.clearCookie(
            ADMIN_COOKIE,
            { path: "/" },
          );
          res.json({ ok: true });
        })
        .catch(next);
    },
  );

  router.get(
    "/me",
    deps.requireAdmin,
    (req, res) => {
      res.json({
        admin: (
          req as AdminedRequest
        ).admin,
      });
    },
  );

  router.get(
    "/stats",
    deps.requireAdmin,
    (_req, res, next) => {
      Promise.all([
        deps.organizations.list(),
        deps.admins.count(),
      ])
        .then(([orgs, admins]) => {
          res.json({
            organizations:
              orgs.length,
            active: orgs.filter(
              (o) =>
                o.status ===
                "active",
            ).length,
            suspended: orgs.filter(
              (o) =>
                o.status ===
                "suspended",
            ).length,
            admins,
          });
        })
        .catch(next);
    },
  );

  router.get(
    "/organizations",
    deps.requireAdmin,
    (_req, res, next) => {
      deps.organizations
        .list()
        .then((organizations) =>
          res.json({
            organizations,
          }),
        )
        .catch(next);
    },
  );

  router.patch(
    "/organizations/:id",
    deps.requireAdmin,
    (req, res, next) => {
      const status = (
        (req.body ?? {}) as {
          status?: unknown;
        }
      ).status;

      if (
        status !== "active" &&
        status !== "suspended"
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_STATUS",
            message:
              "Status must be 'active' or 'suspended'.",
          },
        });

        return;
      }

      deps.organizations
        .update(String(req.params.id), {
          status,
        })
        .then((organization) =>
          res.json({ organization }),
        )
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "";
          if (
            /not found/i.test(message)
          ) {
            res.status(404).json({
              error: {
                code: "NOT_FOUND",
                message,
              },
            });
            return;
          }
          next(error);
        });
    },
  );

  // Living documentation — read-only, admin-only. Filenames are strictly
  // validated (no separators, no traversal) and only .md is served.
  if (deps.docsDir) {
    const docsDir = resolve(
      deps.docsDir,
    );

    router.get(
      "/docs",
      deps.requireAdmin,
      (_req, res) => {
        readdir(docsDir)
          .then((files) =>
            res.json({
              docs: files
                .filter((f) =>
                  /\.md$/i.test(f),
                )
                .sort(),
            }),
          )
          .catch(() =>
            res.json({ docs: [] }),
          );
      },
    );

    router.get(
      "/docs/:name",
      deps.requireAdmin,
      (req, res) => {
        const name = String(
          req.params.name,
        );

        if (
          !/^[A-Za-z0-9_.-]+\.md$/.test(
            name,
          ) ||
          name.includes("..")
        ) {
          res.status(400).json({
            error: {
              code: "INVALID_DOC",
              message:
                "Invalid document name.",
            },
          });

          return;
        }

        readFile(
          resolve(docsDir, name),
          "utf8",
        )
          .then((content) =>
            res.json({
              name,
              content,
            }),
          )
          .catch(() =>
            res.status(404).json({
              error: {
                code: "NOT_FOUND",
                message:
                  "Document not found.",
              },
            }),
          );
      },
    );
  }

  return router;
}

function setCookie(
  res: Response,
  token: string,
  expires: Date,
  secure: boolean,
): void {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires,
    path: "/",
  });
}
