/**
 * Owner/admin domain-registration management API (Stage 11). Mounted under
 * /api/platform behind the CSRF guard + requireUser (tenant from the session).
 *
 * Permissions (per the accepted role policy):
 *  - OWNER-ONLY + recent reauth: purchase checkout, registrant contacts,
 *    auto-renew consent, incoming transfer, outgoing unlock, auth-code request,
 *    unknown-state resolution.
 *  - OWNER/ADMIN: DNS records + nameservers, DNSSEC refresh, manual renewal,
 *    hosting attach.
 *  - Members: read-only.
 *
 * "Recent reauthentication" is proven per-call: the sensitive request carries a
 * `reauthPassword` which is verified against the signed-in user (users.
 * authenticate) inside the session's tenant scope. Cross-tenant ids fail closed
 * — every service call is tenant-scoped, so another tenant's id resolves to a
 * gate error / not-found (404), never another org's data. The client never
 * supplies tenant, provider, wholesale price, markup, currency, status,
 * nameserver-ownership, or provider outcome — those come from the server.
 */

import { Router, type RequestHandler } from "express";

import type { AuthedRequest } from "../auth/requireUser";
import { requireRole } from "../auth/requireRole";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { AuthContext } from "./contact/contactAuthPolicy";
import type { DomainOpsServices } from "./domainIntegration";
import { createDomainRateLimiters, type DomainRateLimiters } from "./ratelimit/domainRateLimit";

export interface DomainOpsRouterDeps {
  requireUser: RequestHandler;
  users: PlatformUserService;
  services: DomainOpsServices;
  /** Abuse-control rate limiters (defaults to per-process token buckets). */
  rateLimiters?: DomainRateLimiters;
}

const org = (req: unknown) => (req as AuthedRequest).auth!.user.organizationId;
const actor = (req: unknown) => (req as AuthedRequest).auth!.user.id;
const role = (req: unknown) => (req as AuthedRequest).auth!.user.role;
const email = (req: unknown) => (req as AuthedRequest).auth!.user.email;

function fail(res: Parameters<RequestHandler>[1], status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

/** Maps a domain service error to a safe HTTP status + code (no internals). */
function mapError(res: Parameters<RequestHandler>[1], e: unknown) {
  const name = (e as { name?: string })?.name ?? "";
  if (/AuthError$/.test(name)) return fail(res, 403, "FORBIDDEN", "Not authorized for this action.");
  if (name === "DnsValidationError") return fail(res, 400, "DNS_VALIDATION", "One or more records are invalid.");
  if (name === "DnsProtectedError") return fail(res, 409, "PROTECTED_RECORD", "Change alters a protected record; confirm explicitly.");
  if (name === "DnsAuthorityError") return fail(res, 409, "DNS_AUTHORITY", "Zone records are not managed here for this domain.");
  if (name === "DuplicateRenewalError" || name === "DuplicateTransferError") return fail(res, 409, "DUPLICATE", "An equivalent operation is already in progress.");
  if (name === "TransferDisabledError") return fail(res, 403, "TRANSFERS_DISABLED", "Incoming transfers are not enabled.");
  if (name === "AutoRenewNotAuthorized") return fail(res, 400, "AUTORENEW_NOT_AUTHORIZED", "Auto-renew requires an eligible saved payment method + consent.");
  if (/GateError$/.test(name)) return fail(res, 409, "GATE", "Preconditions for this action are not met.");
  return fail(res, 400, "REQUEST_FAILED", "The request could not be completed.");
}

export function createDomainOpsRouter(deps: DomainOpsRouterDeps): Router {
  const router = Router();
  const s = deps.services;
  router.use(deps.requireUser);

  const rw = requireRole("owner", "admin"); // owner/admin writes
  const ownerOnly = requireRole("owner"); // owner-only writes
  const rl = deps.rateLimiters ?? createDomainRateLimiters();
  // Rate-limit middleware runs FIRST on each guarded route, so a 429 is returned
  // before any existence/authorization check — it is never an existence oracle.
  const rlSearch = rl.limit("search");
  const rlDns = rl.limit("dns_preview");
  const rlSetup = rl.limit("setup_intent");
  const rlSensitive = rl.limit("sensitive");

  /** Verifies a fresh password for a sensitive action; returns an AuthContext. */
  async function reauth(req: unknown): Promise<AuthContext | null> {
    const pw = ((req as { body?: { reauthPassword?: unknown } }).body?.reauthPassword);
    if (typeof pw !== "string" || pw.length === 0) return null;
    try {
      // authenticate throws on a bad credential — treat any failure as no reauth.
      const user = await deps.users.authenticate(email(req), pw);
      if (!user || user.id !== actor(req)) return null;
      return { role: role(req), reauthenticatedRecently: true };
    } catch {
      return null;
    }
  }

  // ---- read (any authenticated tenant member) ----------------------------
  router.get("/domains", async (req, res) => {
    try {
      res.json({ registrations: await s.registrations.list() });
    } catch { fail(res, 500, "INTERNAL", "Failed to list domains."); }
  });

  router.get("/domains/search", rlSearch, async (req, res) => {
    const q = String((req.query.q ?? "")).trim();
    if (!q) return fail(res, 400, "BAD_REQUEST", "A search term is required.");
    try {
      // Server owns pricing (plan, wholesale, markup, currency); client cannot set it.
      res.json({ results: await s.quotes.search([q], "business") });
    } catch (e) { mapError(res, e); }
  });

  router.get("/domains/registrations/:id", async (req, res) => {
    try {
      const reg = await s.registrations.get(String(req.params.id));
      if (!reg || reg.organizationId !== org(req)) return fail(res, 404, "NOT_FOUND", "Domain not found.");
      const dnsState = await s.dns.getState(String(req.params.id)).catch(() => null);
      res.json({ registration: reg, dns: dnsState });
    } catch (e) { mapError(res, e); }
  });

  // ---- registrant contacts (owner-only + reauth) -------------------------
  router.get("/domains/contacts/:ref/history", rw, async (req, res) => {
    try {
      res.json({ history: await s.contacts.history(String(req.params.ref), "registrant") });
    } catch (e) { mapError(res, e); }
  });

  // ---- DNS: authority + records (owner/admin) ----------------------------
  router.get("/domains/registrations/:id/dns/authority", rw, async (req, res) => {
    try { res.json(await s.dns.recordCapability(String(req.params.id))); } catch (e) { mapError(res, e); }
  });
  router.post("/domains/registrations/:id/dns/preview", rlDns, rw, async (req, res) => {
    try { res.json(await s.dns.previewRecordChanges(String(req.params.id), (req.body?.changes ?? []))); } catch (e) { mapError(res, e); }
  });
  router.post("/domains/registrations/:id/dns/apply", rw, async (req, res) => {
    try {
      const view = await s.dns.applyRecordChanges(String(req.params.id), req.body?.changes ?? [], {
        authorizeProtected: req.body?.authorizeProtected === true, actorUserId: actor(req),
      });
      res.json(view);
    } catch (e) { mapError(res, e); }
  });
  router.post("/domains/registrations/:id/nameservers", rw, async (req, res) => {
    try {
      res.json(await s.dns.setNameserverMode(String(req.params.id), req.body?.mode, req.body?.custom, actor(req)));
    } catch (e) { mapError(res, e); }
  });
  router.get("/domains/registrations/:id/dnssec", rw, async (req, res) => {
    try { res.json({ dnssec: await s.dns.refreshDnssec(String(req.params.id)) }); } catch (e) { mapError(res, e); }
  });
  // Hosting attach — never mutates nameservers/records (enforced in the service).
  router.post("/domains/registrations/:id/hosting/attach", rw, async (req, res) => {
    try {
      const hostingAccountId = String(req.body?.hostingAccountId ?? "");
      if (!hostingAccountId) return fail(res, 400, "BAD_REQUEST", "hostingAccountId is required.");
      res.json(await s.dns.attachHosting(String(req.params.id), hostingAccountId, actor(req)));
    } catch (e) { mapError(res, e); }
  });

  // ---- manual renewal (owner/admin) --------------------------------------
  router.post("/domains/registrations/:id/renew", rw, async (req, res) => {
    try {
      const years = Number(req.body?.termYears ?? 1);
      res.json(await s.renewal.createManualRenewal({ registrationId: String(req.params.id), userId: actor(req), planId: "business", termYears: years, termsAcceptanceId: req.body?.termsAcceptanceId }));
    } catch (e) { mapError(res, e); }
  });

  // ---- OWNER-ONLY + recent reauth ----------------------------------------
  router.post("/domains/checkout", ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to authorize this purchase.");
    try {
      res.json(await s.purchase.createCheckout({ quoteId: String(req.body?.quoteId ?? ""), userId: actor(req), registrationRef: String(req.body?.registrationRef ?? "") }, auth));
    } catch (e) { mapError(res, e); }
  });

  // Disable auto-renew (owner-only + reauth). Never cancels/deletes the domain.
  router.post("/domains/auto-renew/:id", ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to change auto-renew.");
    if (req.body?.enabled !== false) {
      return fail(res, 400, "USE_SETUP_FLOW", "Enable auto-renew via /auto-renew/:id/setup then /confirm.");
    }
    try {
      await s.renewal.disableAutoRenew(String(req.params.id), actor(req));
      res.json({ enabled: false });
    } catch (e) { mapError(res, e); }
  });

  // Begin off-session authorization (Stripe SetupIntent). The client NEVER
  // supplies a payment method directly — it completes the SetupIntent, then
  // confirms below. The renewal price is rechecked before each future charge.
  router.post("/domains/auto-renew/:id/setup", rlSetup, ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to authorize auto-renew.");
    try {
      const r = await s.renewal.beginAutoRenewSetup(String(req.params.id), { stripeCustomerRef: req.body?.stripeCustomerRef }, auth);
      res.json({ ...r, notice: "The renewal price is rechecked before each charge and may change." });
    } catch (e) { mapError(res, e); }
  });

  // Confirm the completed SetupIntent -> record immutable consent -> enable.
  router.post("/domains/auto-renew/:id/confirm", rlSetup, ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to authorize auto-renew.");
    try {
      await s.renewal.confirmAutoRenewSetup(String(req.params.id), {
        setupIntentId: String(req.body?.setupIntentId ?? ""),
        termsAcceptanceId: String(req.body?.termsAcceptanceId ?? ""),
        pricingVersionAck: Number(req.body?.pricingVersionAck ?? 0),
        currency: req.body?.currency ? String(req.body.currency) : undefined,
        mandateText: req.body?.mandateText ? String(req.body.mandateText) : undefined,
      }, auth);
      res.json({ enabled: true });
    } catch (e) { mapError(res, e); }
  });

  router.post("/domains/transfer/incoming", rlSensitive, ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to start a transfer.");
    try {
      res.json(await s.transfer.createIncomingTransfer({
        asciiDomain: String(req.body?.asciiDomain ?? ""), tld: String(req.body?.tld ?? ""),
        userId: actor(req), planId: "business", eppCode: String(req.body?.eppCode ?? ""),
        termsAcceptanceId: req.body?.termsAcceptanceId,
      }, auth));
    } catch (e) { mapError(res, e); }
  });

  router.post("/domains/registrations/:id/transfer/unlock", rlSensitive, ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to unlock the domain.");
    try { await s.transfer.outgoingUnlock(String(req.params.id), auth); res.json({ unlocked: true }); } catch (e) { mapError(res, e); }
  });

  router.post("/domains/registrations/:id/transfer/auth-code", rlSensitive, ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to request the transfer code.");
    try {
      const result = await s.transfer.outgoingRequestAuthCode(String(req.params.id), auth);
      // A returned code (rare; NameSilo emails it) is shown ONCE and never
      // persisted/audited. Harden the response so it isn't cached/stored.
      res.set("Cache-Control", "no-store, max-age=0");
      res.set("Referrer-Policy", "no-referrer");
      res.json(result);
    } catch (e) { mapError(res, e); }
  });

  // ---- unknown-state resolution (owner-only + reauth) --------------------
  router.post("/domains/orders/:id/resolve", rlSensitive, ownerOnly, async (req, res) => {
    const auth = await reauth(req);
    if (!auth) return fail(res, 401, "REAUTH_REQUIRED", "Re-enter your password to resolve this order.");
    try {
      if (req.body?.registered === true) {
        await s.purchase.ownerResolveAsRegistered(String(req.params.id), String(req.body?.evidenceNote ?? ""));
        return res.json({ resolved: "registered" });
      }
      await s.purchase.ownerResolveAsNotRegistered(String(req.params.id));
      res.json({ resolved: "not_registered" });
    } catch (e) { mapError(res, e); }
  });

  return router;
}
