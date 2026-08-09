import { createHash, randomBytes } from "node:crypto";

import { Router, type Request, type Response } from "express";
import express from "express";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { LeadMagnetCapabilityService } from "./LeadMagnetCapabilityService";
import { hasPdfMagic, normalizePdfFilename } from "./magnetFilePolicy";

/**
 * Public, capability-gated download for lead magnets.
 *
 * Flow (fragment-exchange, token never in a URL/log/referrer):
 *  1. GET /magnet — a neutral, self-contained page. Its script reads the token
 *     from the URL FRAGMENT (`#d=`), strips it from history via replaceState
 *     BEFORE anything else, then POSTs it.
 *  2. POST /magnet — atomically redeems the capability (hash + all bindings +
 *     expiry/revocation/use-count, invalidating siblings), confirms the file
 *     still exists and is tenant-owned, and issues a SEPARATE short-lived,
 *     tokenless one-time download SESSION as an httpOnly cookie. The capability
 *     token never appears in the download step.
 *  3. GET /magnet/file — consumes the one-time session and streams the PDF as an
 *     ATTACHMENT (application/octet-stream, nosniff, no-store), never rendered
 *     inline. The browser supplies nothing but the server-issued session cookie —
 *     no org/file/path/mime/redirect/scope is ever accepted from the client.
 *
 * NO RESUME: redemption is one-time. If the download is interrupted or the
 * process restarts, the capability/session is spent and cannot be replayed — the
 * recipient needs a fresh capability (email retry / new submission). Resume is
 * NOT implemented.
 */

/** The minimal file source this router needs (satisfied by PlatformFileService). */
export interface MagnetFileSource {
  get(id: string): Promise<{ name: string; deletedAt?: string }>;
  download(id: string): Promise<{ file: { name: string }; data: Buffer }>;
}

const SESSION_TTL_MS = 2 * 60 * 1000; // short-lived: the download follows immediately
const SESSION_COOKIE = "aec_magnet_dl";

function hash(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function neutralHeaders(res: Response): void {
  res.set("Referrer-Policy", "no-referrer");
  res.set("Cache-Control", "no-store, private, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self'",
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
    ].join("; "),
  );
}

function page(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive"/>
<meta name="referrer" content="no-referrer"/>
<title>Your download</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:34rem;margin:12vh auto;padding:0 20px;color:#14181f;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e8ecf2;background:#14181f}.m{color:#9aa4b2}}
h1{font-size:1.4rem}.m{color:#5b6472}a,button{font:inherit}
:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style></head><body>
<h1>Preparing your download</h1>
<p class="m" id="m" role="status" aria-live="polite">One moment…</p>
<noscript><p class="m">JavaScript is required to complete your download.</p></noscript>
<script>
(function(){var m=document.getElementById('m');
var h=(location.hash||'').match(/^#d=([a-f0-9]{64})$/);
try{history.replaceState(null,'',location.pathname);}catch(e){}
if(!h){m.textContent='This link is missing its code. Please use the link you were given.';return;}
fetch('/magnet',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Privacy-Exchange':'1'},body:JSON.stringify({token:h[1]})})
.then(function(r){return r.json().catch(function(){return{};});})
.then(function(d){if(d&&d.ok){m.textContent='Your download is starting…';location.assign('/magnet/file');}else{m.textContent='This link is invalid, has expired, or was already used.';}})
.catch(function(){m.textContent='Something went wrong. Please try again in a moment.';});})();
</script></body></html>`;
}

export function createLeadMagnetDownloadRouter(deps: {
  capabilities: LeadMagnetCapabilityService;
  files: MagnetFileSource;
  now?: () => number;
  /** True in production (https) so the session cookie is marked Secure. */
  secureCookie?: boolean;
}): Router {
  const router = Router();
  const now = deps.now ?? (() => Date.now());
  // Short-lived one-time download sessions (single-process; not resumable).
  const sessions = new Map<string, { org: string; fileId: string; expiresAt: number }>();

  const readCookie = (req: Request, name: string): string | undefined => {
    const raw = req.headers.cookie;
    if (typeof raw !== "string") return undefined;
    for (const part of raw.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === name) return decodeURIComponent(v.join("="));
    }
    return undefined;
  };

  // (1) Neutral fragment-exchange page.
  router.get("/magnet", (_req, res) => {
    neutralHeaders(res);
    res.type("html").send(page());
  });

  // (2) Exchange the capability → one-time session cookie. Body carries ONLY the
  // token; every other field is ignored.
  router.post("/magnet", express.json(), async (req, res) => {
    neutralHeaders(res);
    const token = typeof (req.body ?? {}).token === "string" ? String((req.body as { token: string }).token) : "";
    const outcome = await deps.capabilities.redeem(token);
    if (!outcome.ok) {
      res.json({ ok: false }); // generic — no reason leaked
      return;
    }
    // Confirm the file still exists and is tenant-owned (tenant scope from the
    // capability, NEVER from the client).
    try {
      const meta = await runWithTenant({ organizationId: outcome.organizationId }, () =>
        deps.files.get(outcome.fileId),
      );
      if (meta.deletedAt) {
        res.json({ ok: false });
        return;
      }
    } catch {
      res.json({ ok: false });
      return;
    }
    const sessionId = randomBytes(24).toString("hex");
    sessions.set(hash(sessionId), {
      org: outcome.organizationId,
      fileId: outcome.fileId,
      expiresAt: now() + SESSION_TTL_MS,
    });
    const attrs = [
      `${SESSION_COOKIE}=${sessionId}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/magnet/file",
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (deps.secureCookie) attrs.push("Secure");
    res.set("Set-Cookie", attrs.join("; "));
    res.json({ ok: true });
  });

  // (3) Serve the file via the tokenless one-time session. Streams as an
  // ATTACHMENT, never inline; nothing is accepted from the client but the cookie.
  router.get("/magnet/file", async (req, res) => {
    const sessionId = readCookie(req, SESSION_COOKIE);
    const notFound = (): void => {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not available." } });
    };
    if (!sessionId || !/^[a-f0-9]{48}$/.test(sessionId)) {
      notFound();
      return;
    }
    const key = hash(sessionId);
    const session = sessions.get(key);
    // One-time: consume immediately (delete) so it can't be replayed.
    sessions.delete(key);
    if (!session || session.expiresAt <= now()) {
      notFound();
      return;
    }
    let bytes: Buffer;
    let name: string;
    try {
      const dl = await runWithTenant({ organizationId: session.org }, () =>
        deps.files.download(session.fileId),
      );
      bytes = dl.data;
      name = dl.file.name;
    } catch {
      notFound();
      return;
    }
    // Defense in depth: only serve if the bytes are actually a PDF.
    if (!hasPdfMagic(bytes)) {
      notFound();
      return;
    }
    const filename = normalizePdfFilename(name);
    // Force download; never render inline. Authoritative, non-sniffable type.
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store, private, max-age=0");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Frame-Options", "DENY");
    res.status(200).send(bytes);
  });

  return router;
}
