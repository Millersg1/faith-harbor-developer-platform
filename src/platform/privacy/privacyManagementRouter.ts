import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import type { AuditService } from "../audit/AuditService";
import { requireRole } from "../auth/requireRole";
import type { AuthedRequest } from "../auth/requireUser";
import { isPrivacyStatus } from "./PrivacyRequest";
import {
  PrivacyNotFoundError,
  PrivacyStateError,
  PrivacyValidationError,
  type Scope,
} from "./PrivacyRequestService";
import type { PrivacyRequestService } from "./PrivacyRequestService";

export interface PrivacyManagementDeps {
  privacy: PrivacyRequestService;
  requireUser: RequestHandler;
  audit?: AuditService;
}

function tenantScope(req: Request): Scope {
  const auth = (req as AuthedRequest).auth;
  return {
    kind: "tenant",
    organizationId: auth?.user.organizationId ?? "",
  };
}

function fail(res: Response, err: unknown): void {
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
      message: err instanceof Error ? err.message : "Request failed.",
    },
  });
}

/**
 * Tenant Privacy Requests management API. Reads + writes require owner/admin
 * (members are denied — requests can contain sensitive personal information).
 * The tenant organization comes from the authenticated session, never a
 * client-supplied id. Audit metadata is compact (ids/enums only — never the
 * requester's name, email, description, notes, or tokens).
 */
export function createPrivacyManagementRouter(
  deps: PrivacyManagementDeps,
): Router {
  const router = Router();
  const svc = deps.privacy;
  const manage = requireRole("owner", "admin");

  const audit = (
    req: Request,
    action: string,
    meta: Record<string, unknown>,
  ) => {
    const auth = (req as AuthedRequest).auth;
    void deps.audit?.record({
      actorType: "user",
      actorId: auth?.user.id,
      actorLabel: auth?.user.email,
      action,
      targetType: "privacy_request",
      outcome: "success",
      ip: req.ip,
      metadata: meta,
    });
  };

  router.get(
    "/privacy-requests/manage",
    deps.requireUser,
    manage,
    (req, res) => {
      const status =
        typeof req.query.status === "string" &&
        isPrivacyStatus(req.query.status)
          ? req.query.status
          : undefined;
      const category =
        typeof req.query.category === "string"
          ? req.query.category
          : undefined;
      svc
        .list(tenantScope(req), {
          status,
          category: category as never,
        })
        .then((requests) => res.json({ requests }))
        .catch((e) => fail(res, e));
    },
  );

  router.get(
    "/privacy-requests/manage/:id",
    deps.requireUser,
    manage,
    (req, res) => {
      svc
        .get(tenantScope(req), String(req.params.id))
        .then((r) => res.json(r))
        .catch((e) => fail(res, e));
    },
  );

  router.post(
    "/privacy-requests/manage/:id/transition",
    deps.requireUser,
    manage,
    (req, res) => {
      const body = (req.body ?? {}) as {
        to?: unknown;
        resolutionSummary?: unknown;
      };
      if (typeof body.to !== "string" || !isPrivacyStatus(body.to)) {
        fail(res, new PrivacyStateError("Unknown target status."));
        return;
      }
      const to = body.to;
      svc
        .transition(tenantScope(req), String(req.params.id), to, {
          resolutionSummary:
            typeof body.resolutionSummary === "string"
              ? body.resolutionSummary
              : undefined,
        })
        .then((rec) => {
          audit(req, "privacy_request.status_changed", {
            requestId: rec.id,
            category: rec.category,
            newStatus: rec.status,
          });
          res.json({ request: rec });
        })
        .catch((e) => fail(res, e));
    },
  );

  router.post(
    "/privacy-requests/manage/:id/assign",
    deps.requireUser,
    manage,
    (req, res) => {
      const body = (req.body ?? {}) as { assignedTo?: unknown };
      svc
        .assign(
          tenantScope(req),
          String(req.params.id),
          typeof body.assignedTo === "string" ? body.assignedTo : null,
        )
        .then((rec) => {
          audit(req, "privacy_request.assigned", {
            requestId: rec.id,
          });
          res.json({ request: rec });
        })
        .catch((e) => fail(res, e));
    },
  );

  router.post(
    "/privacy-requests/manage/:id/due-date",
    deps.requireUser,
    manage,
    (req, res) => {
      const body = (req.body ?? {}) as {
        dueDate?: unknown;
        source?: unknown;
      };
      const source =
        body.source === "policy" ? "policy" : "staff";
      svc
        .setDueDate(
          tenantScope(req),
          String(req.params.id),
          typeof body.dueDate === "string" ? body.dueDate : null,
          source,
        )
        .then((rec) => res.json({ request: rec }))
        .catch((e) => fail(res, e));
    },
  );

  router.post(
    "/privacy-requests/manage/:id/note",
    deps.requireUser,
    manage,
    (req, res) => {
      const body = (req.body ?? {}) as {
        body?: unknown;
        visibility?: unknown;
      };
      const visibility =
        body.visibility === "requester" ? "requester" : "internal";
      const auth = (req as AuthedRequest).auth;
      svc
        .addNote(tenantScope(req), String(req.params.id), {
          body: typeof body.body === "string" ? body.body : "",
          visibility,
          authorId: auth?.user.id,
        })
        .then((note) => {
          audit(req, "privacy_request.note_added", {
            requestId: note.requestId,
            visibility: note.visibility,
          });
          res.json({ note: { id: note.id, visibility: note.visibility, createdAt: note.createdAt } });
        })
        .catch((e) => fail(res, e));
    },
  );

  return router;
}
