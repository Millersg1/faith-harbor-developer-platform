import { Router, type RequestHandler } from "express";

import { requireRole } from "../auth/requireRole";
import type { AuthedRequest } from "../auth/requireUser";
import type { MarketingOutboxService } from "./MarketingOutboxService";
import type { ConfirmationDispatchService } from "./ConfirmationDispatchService";
import type { MarketingPauseService } from "./MarketingPauseService";
import type { DripService } from "../drip/DripService";

/**
 * Owner/admin controls + visibility for the durable marketing pipeline. Mounted
 * behind requireUser (tenant scope + auth) and CSRF. Every write is
 * owner/admin-only (members are read-denied by requireRole); every route is
 * fail-closed to the caller's own organization. Pause/cancel prevent NEW claims;
 * an already-leased item still runs the worker's final eligibility check before
 * SMTP.
 */
export function createMarketingOpsRouter(deps: {
  requireUser: RequestHandler;
  outbox?: MarketingOutboxService;
  confirmationDispatch?: ConfirmationDispatchService;
  pause?: MarketingPauseService;
  drip?: DripService;
}): Router {
  const router = Router();
  const rw = requireRole("owner", "admin");
  const org = (req: unknown): string =>
    (req as AuthedRequest).auth!.user.organizationId;
  const actor = (req: unknown): string => (req as AuthedRequest).auth!.user.id;

  router.use(deps.requireUser);

  // ---- Tenant marketing pause / resume / status ----
  if (deps.pause) {
    const pause = deps.pause;
    router.post("/marketing/pause", rw, (req, res) => {
      pause
        .pauseTenant(org(req), { actor: actor(req), reason: "manual" })
        .then(() => res.json({ ok: true, paused: true }))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not pause." } }));
    });
    router.post("/marketing/resume", rw, (req, res) => {
      pause
        .resumeTenant(org(req), actor(req))
        .then(() => res.json({ ok: true, paused: false }))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not resume." } }));
    });
    router.get("/marketing/status", rw, (req, res) => {
      Promise.all([pause.isTenantPaused(org(req)), pause.list(org(req))])
        .then(([paused, pauses]) => res.json({ paused, pauses }))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Unavailable." } }));
    });
    router.post("/marketing/sequences/:id/pause", rw, (req, res) => {
      pause
        .pauseSequence(org(req), String(req.params.id), actor(req))
        .then(() => res.json({ ok: true }))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not pause." } }));
    });
    router.post("/marketing/sequences/:id/resume", rw, (req, res) => {
      pause
        .resumeSequence(org(req), String(req.params.id), actor(req))
        .then(() => res.json({ ok: true }))
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not resume." } }));
    });
  }

  // ---- Cancel an enrollment AND its queued marketing outbox work ----
  if (deps.drip && deps.outbox) {
    const drip = deps.drip;
    const outbox = deps.outbox;
    router.post("/marketing/enrollments/:id/cancel", rw, (req, res) => {
      const id = String(req.params.id);
      // cancelEnrollment is tenant-scoped (runs in the requireUser tenant scope);
      // cancelForEnrollment then stops any queued/failed steps from being sent.
      drip
        .cancelEnrollment(id)
        .then(() => outbox.cancelForEnrollment(id))
        .then(() => res.json({ ok: true }))
        .catch(() => res.status(404).json({ error: { code: "NOT_FOUND", message: "Enrollment not found." } }));
    });
  }

  // ---- Visibility + delivery-unknown review ----
  if (deps.outbox) {
    const outbox = deps.outbox;
    router.get("/marketing/outbox/attention", rw, (req, res) => {
      Promise.all([
        outbox.needsAttention(org(req)),
        deps.confirmationDispatch?.needsAttention(org(req)) ?? Promise.resolve([]),
      ])
        .then(([marketing, confirmation]) =>
          res.json({
            // Rows already carry only PII-free operational fields + a scrubbed reason.
            marketing,
            confirmation,
          }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Unavailable." } }));
    });

    router.get("/marketing/outbox/:id/history", rw, (req, res) => {
      // Immutable attempt history, fail-closed to the caller's tenant (every
      // attempt row carries its org; a row from another tenant is never shown).
      outbox
        .history(String(req.params.id))
        .then((history) => {
          const owned = history.every((h) => h.organizationId === org(req));
          if (!owned) {
            res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
            return;
          }
          res.json({ history });
        })
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Unavailable." } }));
    });

    // Resolve a delivery_unknown/terminal WITHOUT resending.
    router.post("/marketing/outbox/:id/resolve", rw, (req, res) => {
      outbox
        .resolve(String(req.params.id), org(req), actor(req))
        .then((ok) =>
          ok
            ? res.json({ ok: true })
            : res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not resolve." } }));
    });

    // A DELIBERATE retry — never automatic. Requires an explicit acknowledgement
    // that the earlier attempt may have been accepted (duplicate email possible).
    router.post("/marketing/outbox/:id/retry", rw, (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.acknowledgeDuplicateRisk !== true) {
        res.status(400).json({
          error: {
            code: "ACK_REQUIRED",
            message:
              "The earlier SMTP attempt may have been accepted; a retry can send a duplicate. Resend acknowledgeDuplicateRisk: true to proceed.",
          },
        });
        return;
      }
      outbox
        .retry(String(req.params.id), org(req), actor(req))
        .then((ok) =>
          ok
            ? res.json({ ok: true, warning: "A duplicate email is possible." })
            : res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not retry." } }));
    });

    router.post("/marketing/outbox/:id/cancel", rw, (req, res) => {
      outbox
        .cancelMessage(String(req.params.id), org(req), actor(req))
        .then((ok) =>
          ok
            ? res.json({ ok: true })
            : res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } }),
        )
        .catch(() => res.status(500).json({ error: { code: "INTERNAL", message: "Could not cancel." } }));
    });
  }

  return router;
}
