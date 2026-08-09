import { Router, type RequestHandler } from "express";

import { requireRole } from "../auth/requireRole";
import type { AuthedRequest } from "../auth/requireUser";
import type { LeadMagnetDispatchService } from "./LeadMagnetDispatchService";
import type { LeadMagnetFulfillmentService } from "./LeadMagnetFulfillmentService";
import { checkMagnetFileMeta } from "./magnetFilePolicy";

/** The minimal file source the config helper needs. */
export interface MagnetOpsFileSource {
  get(id: string): Promise<{ mimeType: string; name: string; size: number; deletedAt?: string }>;
}

/**
 * Honest, non-negotiable statements surfaced to owners/admins so the UI can't
 * over-promise.
 */
export const MAGNET_HONESTY = {
  smtpAcceptance:
    "SMTP acceptance means the mail server took responsibility for the message. It is NOT proof of inbox delivery, reading, or engagement.",
  pdfValidation:
    "PDF validation only checks the file is structurally a PDF (declared type, .pdf name, %PDF- signature). It is NOT malware scanning and cannot guarantee a PDF is harmless. Only PDFs are permitted as lead magnets.",
} as const;

/**
 * Owner/admin config + inspection for lead magnets. Owner/admin only (members
 * denied by requireRole). Every response is fail-closed to the caller's org and
 * PII-FREE: recipient addresses, raw tokens, filesystem paths, and email bodies
 * are never exposed.
 */
export function createMagnetOpsRouter(deps: {
  requireUser: RequestHandler;
  dispatch?: LeadMagnetDispatchService;
  fulfillment?: LeadMagnetFulfillmentService;
  files?: MagnetOpsFileSource;
  /** Whether an authenticated transactional sender is configured (email mode). */
  transactionalConfigured: boolean;
}): Router {
  const router = Router();
  const rw = requireRole("owner", "admin");
  const org = (req: unknown): string => (req as AuthedRequest).auth!.user.organizationId;

  router.use(deps.requireUser);

  // Fulfillment status (PII-free projection: no recipient email).
  if (deps.fulfillment) {
    const fulfillment = deps.fulfillment;
    router.get("/magnet/fulfillments", rw, (req, res) => {
      fulfillment
        .listForOrg(org(req))
        .then((rows) =>
          res.json({
            fulfillments: rows.map((f) => ({
              id: f.id,
              formId: f.formId,
              mode: f.mode,
              status: f.status,
              reason: f.reason,
              createdAt: f.createdAt,
            })),
            honesty: MAGNET_HONESTY,
          }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Unavailable." } }));
    });
  }

  // PDF-eligibility check for the file-selection UI (mode-specific validation).
  if (deps.files) {
    const files = deps.files;
    router.get("/magnet/files/:fileId/eligibility", rw, (req, res) => {
      files
        .get(String(req.params.fileId))
        .then((f) => {
          const r = checkMagnetFileMeta({ mimeType: f.mimeType, name: f.name, size: f.size, deletedAt: f.deletedAt });
          res.json({
            eligible: r.ok,
            reason: r.ok ? null : r.reason,
            senderConfigured: deps.transactionalConfigured, // warning source for email mode
            honesty: MAGNET_HONESTY,
          });
        })
        .catch(() => res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found." } }));
    });
  }

  // Dispatch review (delivery_unknown / terminal) + safe controls.
  if (deps.dispatch) {
    const dispatch = deps.dispatch;
    router.get("/magnet/dispatch/attention", rw, (req, res) => {
      dispatch
        .needsAttention(org(req))
        .then((rows) =>
          res.json({
            // PII-free: no recipient email, no download base, no token.
            items: rows.map((d) => ({
              id: d.id,
              fulfillmentId: d.fulfillmentId,
              status: d.status,
              reason: d.reason,
              attempts: d.attempts,
              updatedAt: d.updatedAt,
            })),
            honesty: MAGNET_HONESTY,
          }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Unavailable." } }));
    });

    router.post("/magnet/dispatch/:id/resolve", rw, (req, res) => {
      dispatch
        .resolve(String(req.params.id), org(req))
        .then((ok) => (ok ? res.json({ ok: true }) : res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } })))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not resolve." } }));
    });

    router.post("/magnet/dispatch/:id/retry", rw, (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.acknowledgeDuplicateRisk !== true) {
        res.status(400).json({
          error: {
            code: "ACK_REQUIRED",
            message:
              "The earlier attempt may have been accepted; a retry can send a duplicate email. Resend acknowledgeDuplicateRisk: true to proceed.",
          },
        });
        return;
      }
      dispatch
        .retry(String(req.params.id), org(req))
        .then((ok) =>
          ok
            ? res.json({ ok: true, warning: "A duplicate email is possible; a fresh download link will be issued." })
            : res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not retry." } }));
    });

    router.post("/magnet/dispatch/:id/cancel", rw, (req, res) => {
      dispatch
        .cancel(String(req.params.id), org(req))
        .then((ok) => (ok ? res.json({ ok: true }) : res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } })))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not cancel." } }));
    });
  }

  return router;
}
