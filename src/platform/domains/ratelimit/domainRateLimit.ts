/**
 * Abuse-control rate limiting for the tenant domain endpoints (search /
 * availability / price, quote/search, DNS preview, SetupIntent + auto-renew
 * setup, transfer unlock / auth-code, unknown-state resolution). Built on the
 * shared token bucket. Each request must pass a per-IP, per-user, per-tenant, and
 * a platform-wide bucket for its endpoint group; failing any one yields a 429.
 *
 * The limiter runs BEFORE the route handler and NEVER inspects whether the
 * domain / order / contact exists, so a throttled response is byte-for-byte
 * identical regardless of what (if anything) the id refers to — it cannot be
 * used as an existence oracle. The body is a fixed generic message; a coarse
 * `Retry-After` (whole seconds) is the only timing signal.
 */

import type { RequestHandler } from "express";

import type { AuthedRequest } from "../../auth/requireUser";
import { TokenBucketRateLimiter, type RateLimitRule } from "./TokenBucketRateLimiter";

export type DomainRateBucket =
  | "search"        // domain search / availability / price / quote
  | "dns_preview"   // DNS record previews
  | "setup_intent"  // SetupIntent + auto-renew setup/confirm
  | "sensitive";    // unlock / auth-code / transfer / resolve

/** Per-scope rules for each bucket (capacity = burst, refillPerSec = steady). */
const DEFAULT_RULES: Record<DomainRateBucket, { ip: RateLimitRule; user: RateLimitRule; tenant: RateLimitRule; platform: RateLimitRule }> = {
  search: {
    ip: { capacity: 30, refillPerSec: 1 },
    user: { capacity: 40, refillPerSec: 1 },
    tenant: { capacity: 80, refillPerSec: 2 },
    platform: { capacity: 300, refillPerSec: 50 },
  },
  dns_preview: {
    ip: { capacity: 20, refillPerSec: 0.5 },
    user: { capacity: 20, refillPerSec: 0.5 },
    tenant: { capacity: 40, refillPerSec: 1 },
    platform: { capacity: 150, refillPerSec: 20 },
  },
  setup_intent: {
    ip: { capacity: 10, refillPerSec: 0.2 },
    user: { capacity: 10, refillPerSec: 0.2 },
    tenant: { capacity: 20, refillPerSec: 0.5 },
    platform: { capacity: 60, refillPerSec: 5 },
  },
  sensitive: {
    ip: { capacity: 10, refillPerSec: 0.2 },
    user: { capacity: 10, refillPerSec: 0.2 },
    tenant: { capacity: 20, refillPerSec: 0.5 },
    platform: { capacity: 60, refillPerSec: 5 },
  },
};

export interface DomainRateLimiters {
  limit(bucket: DomainRateBucket): RequestHandler;
}

export function createDomainRateLimiters(
  nowMs: () => number = () => Date.now(),
  rules: Partial<Record<DomainRateBucket, { ip: RateLimitRule; user: RateLimitRule; tenant: RateLimitRule; platform: RateLimitRule }>> = {},
): DomainRateLimiters {
  const mk = (r: RateLimitRule) => new TokenBucketRateLimiter(r, nowMs);
  const limiters = new Map<DomainRateBucket, { ip: TokenBucketRateLimiter; user: TokenBucketRateLimiter; tenant: TokenBucketRateLimiter; platform: TokenBucketRateLimiter }>();
  const rulesFor = (b: DomainRateBucket) => rules[b] ?? DEFAULT_RULES[b];
  for (const b of Object.keys(DEFAULT_RULES) as DomainRateBucket[]) {
    const r = rulesFor(b);
    limiters.set(b, { ip: mk(r.ip), user: mk(r.user), tenant: mk(r.tenant), platform: mk(r.platform) });
  }

  return {
    limit(bucket: DomainRateBucket): RequestHandler {
      const l = limiters.get(bucket)!;
      return (req, res, next) => {
        const auth = (req as AuthedRequest).auth;
        const ipKey = `${bucket}:${req.ip ?? "unknown"}`;
        const userKey = `${bucket}:${auth?.user.id ?? "anon"}`;
        const tenantKey = `${bucket}:${auth?.user.organizationId ?? "none"}`;
        const gates: Array<[TokenBucketRateLimiter, string]> = [
          [l.ip, ipKey], [l.user, userKey], [l.tenant, tenantKey], [l.platform, "platform"],
        ];
        // Peek all before spending, so denial on one gate doesn't burn tokens on
        // the others (and the decision is order-independent).
        const denied = gates.find(([lim, key]) => lim.peek(key) < 1);
        if (denied) {
          const retryAfterMs = denied[0].tryRemove(denied[1]).retryAfterMs;
          const retryAfterSec = Number.isFinite(retryAfterMs) ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : 60;
          res.setHeader("Retry-After", String(retryAfterSec));
          // Fixed generic body — reveals nothing about the target's existence.
          res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." } });
          return;
        }
        for (const [lim, key] of gates) lim.tryRemove(key);
        next();
      };
    },
  };
}
