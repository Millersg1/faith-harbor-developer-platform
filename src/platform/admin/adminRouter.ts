import {
  readdir,
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import type { OrganizationService } from "../../tenancy/OrganizationService";
import type { PlatformAnalyticsService } from "../analytics/PlatformAnalyticsService";
import type { PlatformHealthService } from "../health/PlatformHealthService";
import type { PlatformLegalService } from "../legal/PlatformLegalService";
import { isLegalKind } from "../legal/PlatformLegalDocument";
import { renderLegalMarkdown } from "../legal/legalMarkdown";
import { isPrivacyStatus } from "../privacy/PrivacyRequest";
import {
  PrivacyNotFoundError,
  PrivacyStateError,
  PrivacyValidationError,
} from "../privacy/PrivacyRequestService";
import type { PrivacyRequestService } from "../privacy/PrivacyRequestService";
import type { PlatformAuditService } from "../audit/PlatformAuditService";
import { toPublicAdmin } from "./PlatformAdmin";
import {
  AdminPasswordError,
  type PlatformAdminService,
} from "./PlatformAdminService";
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
  analytics?: PlatformAnalyticsService;
  health?: PlatformHealthService;
  legal?: PlatformLegalService;
  privacy?: PrivacyRequestService;
  platformAudit?: PlatformAuditService;
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

  // Self-service password change for the signed-in admin.
  router.post(
    "/change-password",
    deps.requireAdmin,
    (req, res, next) => {
      const admin = (
        req as AdminedRequest
      ).admin;

      if (!admin) {
        res.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message:
              "You must be signed in.",
          },
        });

        return;
      }

      const body =
        req.body &&
        typeof req.body === "object"
          ? (req.body as Record<
              string,
              unknown
            >)
          : {};
      const currentPassword = String(
        body.currentPassword ?? "",
      );
      const newPassword = String(
        body.newPassword ?? "",
      );

      deps.admins
        .changePassword(
          admin.id,
          currentPassword,
          newPassword,
        )
        .then(() =>
          res.json({ ok: true }),
        )
        .catch((error: unknown) => {
          if (
            error instanceof
            AdminPasswordError
          ) {
            res.status(400).json({
              error: {
                code: "INVALID_PASSWORD_CHANGE",
                message:
                  error.message,
              },
            });

            return;
          }

          next(error);
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

  // Platform business analytics (MRR, plan mix, AI cost) — superadmin only.
  if (deps.analytics) {
    const analytics = deps.analytics;
    router.get(
      "/analytics",
      deps.requireAdmin,
      (_req, res, next) => {
        analytics
          .summary()
          .then((summary) =>
            res.json(summary),
          )
          .catch(next);
      },
    );
  }

  // System health (DB, workers, connectivity) — superadmin only.
  if (deps.health) {
    const health = deps.health;
    router.get(
      "/system-health",
      deps.requireAdmin,
      (_req, res, next) => {
        health
          .snapshot()
          .then((snapshot) =>
            res.json(snapshot),
          )
          .catch(next);
      },
    );
  }

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

  // Platform legal-document management (owner-only, cross-tenant is N/A —
  // these are the platform's OWN documents). Every write is audited by the
  // service. Published versions are immutable; editing creates a new version.
  if (deps.legal) {
    const legal = deps.legal;
    const actorId = (req: AdminedRequest): string | null =>
      req.admin?.id ?? null;
    const notFound = (res: Response): void => {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Legal document not found.",
        },
      });
    };
    const fail = (res: Response, err: unknown): void => {
      const message =
        err instanceof Error ? err.message : "Request failed.";
      res.status(400).json({
        error: { code: "LEGAL_ERROR", message },
      });
    };

    // All documents (every version, every kind).
    router.get(
      "/legal/documents",
      deps.requireAdmin,
      (_req, res) => {
        legal
          .listAll()
          .then((docs) => res.json({ documents: docs }))
          .catch((err) => fail(res, err));
      },
    );

    // Versions of one kind (newest first).
    router.get(
      "/legal/documents/:kind",
      deps.requireAdmin,
      (req, res) => {
        const kind = String(req.params.kind);
        if (!isLegalKind(kind)) {
          notFound(res);
          return;
        }
        legal
          .listVersions(kind)
          .then((versions) => res.json({ versions }))
          .catch((err) => fail(res, err));
      },
    );

    // Create a new draft version. If a version already exists, the new draft
    // is cloned from the current published/latest one; otherwise the body is
    // required to seed the first version.
    router.post(
      "/legal/documents/:kind/draft",
      deps.requireAdmin,
      (req, res) => {
        const kind = String(req.params.kind);
        if (!isLegalKind(kind)) {
          notFound(res);
          return;
        }
        const body = (req.body ?? {}) as {
          title?: unknown;
          summary?: unknown;
          bodyMarkdown?: unknown;
        };
        legal
          .listVersions(kind)
          .then((versions) => {
            if (versions.length > 0) {
              return legal.createNewVersion(
                kind,
                actorId(req as AdminedRequest),
              );
            }
            if (
              typeof body.title !== "string" ||
              typeof body.summary !== "string" ||
              typeof body.bodyMarkdown !== "string"
            ) {
              throw new Error(
                "title, summary, and bodyMarkdown are required for a first version.",
              );
            }
            return legal.createDraft({
              kind,
              title: body.title,
              summary: body.summary,
              bodyMarkdown: body.bodyMarkdown,
              createdBy: actorId(req as AdminedRequest),
            });
          })
          .then((doc) => res.status(201).json({ document: doc }))
          .catch((err) => fail(res, err));
      },
    );

    // Edit a draft (immutable versions are refused by the service).
    router.put(
      "/legal/documents/:id",
      deps.requireAdmin,
      (req, res) => {
        const body = (req.body ?? {}) as {
          title?: unknown;
          summary?: unknown;
          bodyMarkdown?: unknown;
          requiresReconsent?: unknown;
        };
        legal
          .updateDraft(String(req.params.id), {
            title:
              typeof body.title === "string"
                ? body.title
                : undefined,
            summary:
              typeof body.summary === "string"
                ? body.summary
                : undefined,
            bodyMarkdown:
              typeof body.bodyMarkdown === "string"
                ? body.bodyMarkdown
                : undefined,
            requiresReconsent:
              typeof body.requiresReconsent === "boolean"
                ? body.requiresReconsent
                : undefined,
          })
          .then((doc) => res.json({ document: doc }))
          .catch((err) => fail(res, err));
      },
    );

    // Sanitized HTML preview of a version's body (safe renderer).
    router.get(
      "/legal/documents/:id/preview",
      deps.requireAdmin,
      (req, res) => {
        legal
          .getById(String(req.params.id))
          .then((doc) => {
            if (!doc) {
              notFound(res);
              return;
            }
            const rendered = renderLegalMarkdown(doc.bodyMarkdown);
            res.json({
              document: doc,
              html: rendered.html,
            });
          })
          .catch((err) => fail(res, err));
      },
    );

    // Compare a version against another (default: the previous version of the
    // same kind). Returns both bodies for the UI to diff.
    router.get(
      "/legal/documents/:id/compare",
      deps.requireAdmin,
      (req, res) => {
        legal
          .getById(String(req.params.id))
          .then(async (doc) => {
            if (!doc) {
              notFound(res);
              return;
            }
            const versions = await legal.listVersions(doc.kind);
            const against =
              typeof req.query.against === "string"
                ? await legal.getById(req.query.against)
                : versions.find((v) => v.version < doc.version);
            res.json({
              current: {
                version: doc.version,
                bodyMarkdown: doc.bodyMarkdown,
              },
              previous: against
                ? {
                    version: against.version,
                    bodyMarkdown: against.bodyMarkdown,
                  }
                : null,
            });
          })
          .catch((err) => fail(res, err));
      },
    );

    // Move a draft into "legal review required".
    router.post(
      "/legal/documents/:id/review",
      deps.requireAdmin,
      (req, res) => {
        legal
          .acknowledgeReview(String(req.params.id))
          .then((doc) => res.json({ document: doc }))
          .catch((err) => fail(res, err));
      },
    );

    // Publish (optionally scheduling the effective date).
    router.post(
      "/legal/documents/:id/publish",
      deps.requireAdmin,
      (req, res) => {
        const body = (req.body ?? {}) as {
          effectiveDate?: unknown;
        };
        legal
          .publish(String(req.params.id), {
            effectiveDate:
              typeof body.effectiveDate === "string"
                ? body.effectiveDate
                : undefined,
          })
          .then((doc) => res.json({ document: doc }))
          .catch((err) => fail(res, err));
      },
    );

    // Archive a non-published version.
    router.post(
      "/legal/documents/:id/archive",
      deps.requireAdmin,
      (req, res) => {
        legal
          .archive(String(req.params.id))
          .then((doc) => res.json({ document: doc }))
          .catch((err) => fail(res, err));
      },
    );
  }

  // Platform privacy requests (about All Elite Cloud itself). Only authorized
  // platform admins; scope is always {kind:'platform'} — tenant requests are
  // never reachable here. Audited via structured logs (ids/enums only).
  if (deps.privacy) {
    const privacy = deps.privacy;
    const scope = { kind: "platform" as const };
    const pfail = (res: Response, err: unknown): void => {
      if (err instanceof PrivacyNotFoundError) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
        return;
      }
      if (
        err instanceof PrivacyStateError ||
        err instanceof PrivacyValidationError
      ) {
        res.status(400).json({
          error: { code: "PRIVACY_ERROR", message: err.message },
        });
        return;
      }
      res.status(400).json({
        error: {
          code: "PRIVACY_ERROR",
          message:
            err instanceof Error ? err.message : "Request failed.",
        },
      });
    };
    // Durable, queryable, tenant-neutral audit for platform privacy actions.
    // Records compact enums + identifiers ONLY (never names/emails/descriptions/
    // notes/tokens). Best-effort: never throws into the audited action.
    const plog = (
      req: Request,
      action: string,
      targetId: string,
      meta: Record<string, unknown>,
    ): void => {
      const adminId = (req as AdminedRequest).admin?.id ?? null;
      void deps.platformAudit?.record({
        action,
        actorType: "platform_admin",
        actorId: adminId,
        targetType: "privacy_request",
        targetId,
        outcome: "success",
        metadata: meta,
      });
    };

    router.get(
      "/privacy-requests",
      deps.requireAdmin,
      (req, res) => {
        const status =
          typeof req.query.status === "string" &&
          isPrivacyStatus(req.query.status)
            ? req.query.status
            : undefined;
        privacy
          .list(scope, { status })
          .then((requests) => res.json({ requests }))
          .catch((e) => pfail(res, e));
      },
    );
    router.get(
      "/privacy-requests/:id",
      deps.requireAdmin,
      (req, res) => {
        privacy
          .get(scope, String(req.params.id))
          .then((r) => res.json(r))
          .catch((e) => pfail(res, e));
      },
    );
    router.post(
      "/privacy-requests/:id/transition",
      deps.requireAdmin,
      (req, res) => {
        const body = (req.body ?? {}) as {
          to?: unknown;
          resolutionSummary?: unknown;
        };
        if (typeof body.to !== "string" || !isPrivacyStatus(body.to)) {
          pfail(res, new PrivacyStateError("Unknown target status."));
          return;
        }
        const to = body.to;
        privacy
          .transition(scope, String(req.params.id), to, {
            resolutionSummary:
              typeof body.resolutionSummary === "string"
                ? body.resolutionSummary
                : undefined,
          })
          .then((rec) => {
            plog(req, "privacy_request.status_changed", rec.id, {
              destination: "platform",
              category: rec.category,
              newStatus: rec.status,
            });
            res.json({ request: rec });
          })
          .catch((e) => pfail(res, e));
      },
    );
    router.post(
      "/privacy-requests/:id/note",
      deps.requireAdmin,
      (req, res) => {
        const body = (req.body ?? {}) as {
          body?: unknown;
          visibility?: unknown;
        };
        const visibility =
          body.visibility === "requester" ? "requester" : "internal";
        privacy
          .addNote(scope, String(req.params.id), {
            body: typeof body.body === "string" ? body.body : "",
            visibility,
            authorId: (req as AdminedRequest).admin?.id ?? null,
          })
          .then((note) => {
            // Audit records only the note's visibility + id — never its body.
            plog(req, "privacy_request.note_added", String(req.params.id), {
              destination: "platform",
              noteId: note.id,
              visibility: note.visibility,
            });
            res.json({
              note: {
                id: note.id,
                visibility: note.visibility,
                createdAt: note.createdAt,
              },
            });
          })
          .catch((e) => pfail(res, e));
      },
    );
    // Durable audit trail for a platform privacy request (admin-only, no PII).
    router.get(
      "/privacy-requests/:id/audit",
      deps.requireAdmin,
      (req, res) => {
        if (!deps.platformAudit) {
          res.json({ events: [] });
          return;
        }
        deps.platformAudit
          .listForTarget("privacy_request", String(req.params.id))
          .then((events) => res.json({ events }))
          .catch((e) => pfail(res, e));
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
