import { describe, expect, it, vi } from "vitest";

import { createDomainRateLimiters } from "./domainRateLimit";

const RULES = {
  search: {
    ip: { capacity: 3, refillPerSec: 1 },
    user: { capacity: 100, refillPerSec: 100 },
    tenant: { capacity: 100, refillPerSec: 100 },
    platform: { capacity: 100, refillPerSec: 100 },
  },
} as const;

function fakeReqRes(over: { ip?: string; userId?: string; orgId?: string } = {}) {
  const req = { ip: over.ip ?? "1.1.1.1", auth: { user: { id: over.userId ?? "u1", organizationId: over.orgId ?? "org1", role: "owner", email: "u@x.com" } } } as never;
  const headers: Record<string, string> = {};
  let status = 0; let body: unknown;
  const res = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status: (n: number) => { status = n; return res; },
    json: (b: unknown) => { body = b; return res; },
  } as never;
  return { req, res, get status() { return status; }, get body() { return body as { error?: { code?: string; message?: string } }; }, headers };
}

describe("Stage L6 — domain endpoint rate limiting", () => {
  it("allows up to capacity, then 429s with a generic body + Retry-After", () => {
    let t = 0;
    const rl = createDomainRateLimiters(() => t, RULES);
    const mw = rl.limit("search");
    const next = vi.fn();
    for (let i = 0; i < 3; i++) { const c = fakeReqRes(); mw(c.req, c.res, next); }
    expect(next).toHaveBeenCalledTimes(3);
    // 4th from same IP is throttled.
    const c = fakeReqRes();
    mw(c.req, c.res, next);
    expect(next).toHaveBeenCalledTimes(3); // not called again
    expect(c.status).toBe(429);
    expect(c.body.error?.code).toBe("RATE_LIMITED");
    expect(Number(c.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    // Generic body: no domain, id, tenant, or existence signal.
    expect(JSON.stringify(c.body)).not.toMatch(/org1|u1|1\.1\.1\.1|exist/i);
  });

  it("is existence-agnostic: the 429 body is identical regardless of the target", () => {
    let t = 0;
    const rl = createDomainRateLimiters(() => t, RULES);
    const mw = rl.limit("search");
    const next = vi.fn();
    for (let i = 0; i < 3; i++) { const c = fakeReqRes(); mw(c.req, c.res, next); }
    // Two throttled requests (the middleware never sees which id is targeted).
    const a = fakeReqRes(); mw(a.req, a.res, next);
    const b = fakeReqRes(); mw(b.req, b.res, next);
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
  });

  it("scopes are independent: a different IP has its own budget", () => {
    let t = 0;
    const rl = createDomainRateLimiters(() => t, RULES);
    const mw = rl.limit("search");
    const next = vi.fn();
    for (let i = 0; i < 3; i++) { const c = fakeReqRes({ ip: "1.1.1.1" }); mw(c.req, c.res, next); }
    // Same IP now throttled...
    const throttled = fakeReqRes({ ip: "1.1.1.1" }); mw(throttled.req, throttled.res, next);
    expect(throttled.status).toBe(429);
    // ...but a fresh IP still passes.
    const fresh = fakeReqRes({ ip: "2.2.2.2" }); const n2 = vi.fn(); mw(fresh.req, fresh.res, n2);
    expect(n2).toHaveBeenCalledTimes(1);
    expect(fresh.status).toBe(0);
  });

  it("refills over time (a throttled IP recovers)", () => {
    let t = 0;
    const rl = createDomainRateLimiters(() => t, RULES);
    const mw = rl.limit("search");
    for (let i = 0; i < 3; i++) { const c = fakeReqRes(); mw(c.req, c.res, vi.fn()); }
    const blocked = fakeReqRes(); mw(blocked.req, blocked.res, vi.fn());
    expect(blocked.status).toBe(429);
    t = 1000; // one token refilled (1/sec)
    const after = fakeReqRes(); const n = vi.fn(); mw(after.req, after.res, n);
    expect(n).toHaveBeenCalledTimes(1);
  });
});
