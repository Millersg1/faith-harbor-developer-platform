import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import type { AuditService } from "../audit/AuditService";
import { requireRole } from "../auth/requireRole";
import type { AuthedRequest } from "../auth/requireUser";
import {
  ImmutableLegalDocumentError,
  LegalDocumentNotFoundError,
  LegalMarkerError,
  LegalStateError,
} from "../legal/PlatformLegalService";
import { renderLegalMarkdown } from "../legal/legalMarkdown";
import {
  isTenantLegalKind,
  tenantLegalKindsInOrder,
} from "./TenantLegalDocument";
import { QUESTIONNAIRE_FIELDS } from "./TenantQuestionnaire";
import type { TenantLegalService } from "./TenantLegalService";

export interface TenantLegalRouterDependencies {
  legal: TenantLegalService;
  requireUser: RequestHandler;
  audit?: AuditService;
}

function actor(req: Request) {
  const a = (req as AuthedRequest).auth;
  return {
    actorType: "user" as const,
    actorId: a?.user.id,
    actorLabel: a?.user.email,
  };
}

function mapError(res: Response, err: unknown): void {
  if (err instanceof LegalDocumentNotFoundError) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: err.message },
    });
    return;
  }
  if (
    err instanceof LegalMarkerError ||
    err instanceof ImmutableLegalDocumentError ||
    err instanceof LegalStateError
  ) {
    res.status(400).json({
      error: { code: "LEGAL_ERROR", message: err.message },
    });
    return;
  }
  res.status(400).json({
    error: {
      code: "LEGAL_ERROR",
      message:
        err instanceof Error ? err.message : "Request failed.",
    },
  });
}

/**
 * Tenant Legal & Compliance workspace API. Every route is authenticated and
 * runs in the tenant context established by requireUser; the service and
 * repositories fail closed without it. Reads are open to any member; writes
 * require owner/admin. Lifecycle actions are audited (ids/enums only — never
 * document bodies or personal information).
 */
export function createTenantLegalRouter(
  deps: TenantLegalRouterDependencies,
): Router {
  const router = Router();
  const legal = deps.legal;
  const write = requireRole("owner", "admin");

  const audit = (
    req: Request,
    action: string,
    meta: Record<string, unknown>,
  ) => {
    void deps.audit?.record({
      ...actor(req),
      action,
      targetType: "tenant_legal_document",
      outcome: "success",
      ip: req.ip,
      metadata: meta,
    });
  };

  // ---- Questionnaire ----
  router.get(
    "/legal-workspace/questionnaire",
    deps.requireUser,
    (_req, res) => {
      legal
        .getQuestionnaire()
        .then((q) =>
          res.json({ ...q, fields: QUESTIONNAIRE_FIELDS }),
        )
        .catch((e) => mapError(res, e));
    },
  );

  router.put(
    "/legal-workspace/questionnaire",
    deps.requireUser,
    write,
    (req, res) => {
      const body = (req.body ?? {}) as {
        answers?: unknown;
      };
      legal
        .saveQuestionnaire(body.answers)
        .then((q) => {
          audit(req, "tenant_legal.questionnaire_updated", {
            fields: Object.keys(q.answers).length,
          });
          res.json(q);
        })
        .catch((e) => mapError(res, e));
    },
  );

  // ---- Documents ----
  router.get(
    "/legal-workspace/documents",
    deps.requireUser,
    (_req, res) => {
      legal
        .listAll()
        .then((documents) =>
          res.json({
            documents,
            kinds: tenantLegalKindsInOrder(),
          }),
        )
        .catch((e) => mapError(res, e));
    },
  );

  router.get(
    "/legal-workspace/documents/:kind",
    deps.requireUser,
    (req, res) => {
      const kind = String(req.params.kind);
      if (!isTenantLegalKind(kind)) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Unknown kind." },
        });
        return;
      }
      legal
        .listVersions(kind)
        .then((versions) => res.json({ versions }))
        .catch((e) => mapError(res, e));
    },
  );

  router.post(
    "/legal-workspace/documents/:kind/generate",
    deps.requireUser,
    write,
    (req, res) => {
      const kind = String(req.params.kind);
      if (!isTenantLegalKind(kind)) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Unknown kind." },
        });
        return;
      }
      legal
        .generateDraft(kind, actor(req).actorId ?? null)
        .then((r) => {
          audit(req, "tenant_legal.generated", {
            kind,
            version: r.document.version,
            missing: r.missingFacts.length,
          });
          res.status(201).json(r);
        })
        .catch((e) => mapError(res, e));
    },
  );

  router.post(
    "/legal-workspace/documents/:kind/new-version",
    deps.requireUser,
    write,
    (req, res) => {
      const kind = String(req.params.kind);
      if (!isTenantLegalKind(kind)) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Unknown kind." },
        });
        return;
      }
      legal
        .createNewVersion(kind, actor(req).actorId ?? null)
        .then((document) => {
          audit(req, "tenant_legal.new_version", {
            kind,
            version: document.version,
          });
          res.status(201).json({ document });
        })
        .catch((e) => mapError(res, e));
    },
  );

  router.put(
    "/legal-workspace/documents/:id",
    deps.requireUser,
    write,
    (req, res) => {
      const body = (req.body ?? {}) as {
        title?: unknown;
        bodyMarkdown?: unknown;
      };
      legal
        .updateDraft(String(req.params.id), {
          title:
            typeof body.title === "string"
              ? body.title
              : undefined,
          bodyMarkdown:
            typeof body.bodyMarkdown === "string"
              ? body.bodyMarkdown
              : undefined,
        })
        .then((document) => res.json({ document }))
        .catch((e) => mapError(res, e));
    },
  );

  router.get(
    "/legal-workspace/documents/:id/preview",
    deps.requireUser,
    (req, res) => {
      legal
        .getById(String(req.params.id))
        .then((doc) => {
          if (!doc) {
            res.status(404).json({
              error: {
                code: "NOT_FOUND",
                message: "Document not found.",
              },
            });
            return;
          }
          res.json({
            document: doc,
            html: renderLegalMarkdown(doc.bodyMarkdown).html,
          });
        })
        .catch((e) => mapError(res, e));
    },
  );

  const lifecycle = (
    path: string,
    action: string,
    run: (
      id: string,
      req: Request,
    ) => Promise<{ id: string; kind: string; version: number }>,
  ) => {
    router.post(
      `/legal-workspace/documents/:id/${path}`,
      deps.requireUser,
      write,
      (req, res) => {
        run(String(req.params.id), req)
          .then((document) => {
            audit(req, action, {
              kind: document.kind,
              version: document.version,
            });
            res.json({ document });
          })
          .catch((e) => mapError(res, e));
      },
    );
  };

  lifecycle("review", "tenant_legal.reviewed", (id) =>
    legal.markReviewed(id),
  );
  lifecycle("publish", "tenant_legal.published", (id, req) => {
    const body = (req.body ?? {}) as { effectiveDate?: unknown };
    return legal.publish(id, {
      effectiveDate:
        typeof body.effectiveDate === "string"
          ? body.effectiveDate
          : undefined,
    });
  });
  lifecycle("unpublish", "tenant_legal.unpublished", (id) =>
    legal.unpublish(id),
  );
  lifecycle("restore", "tenant_legal.restored", (id, req) =>
    legal.restoreAsDraft(id, actor(req).actorId ?? null),
  );
  lifecycle("archive", "tenant_legal.archived", (id) =>
    legal.archive(id),
  );

  return router;
}
