import { describe, expect, it } from "vitest";

import {
  EmailVerificationService,
  EmailVerificationTokenRepository,
  type UserVerificationStore,
} from "./EmailVerificationService";

function stubStore(users: Record<string, { email: string; verifiedAt?: string }>): UserVerificationStore {
  return {
    getEmail: async (id) => users[id]?.email,
    isVerified: async (id) => Boolean(users[id]?.verifiedAt),
    markVerified: async (id, email, at) => {
      // Mirrors the real store's atomic guard: set ONLY if the current email
      // matches AND it is not already verified (email_verified_at IS NULL).
      const u = users[id];
      if (!u || u.email.trim().toLowerCase() !== email || u.verifiedAt) {
        return false;
      }
      u.verifiedAt = at;
      return true;
    },
    clearVerification: async (id) => {
      if (users[id]) users[id].verifiedAt = undefined;
    },
  };
}

function build(users: Record<string, { email: string; verifiedAt?: string }>, now = () => 1_000_000) {
  return new EmailVerificationService(
    stubStore(users),
    new EmailVerificationTokenRepository(),
    now,
  );
}

describe("EmailVerificationService", () => {
  it("existing users are NOT verified by default (no fabricated timestamp)", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users);
    expect(await svc.isVerified("u1")).toBe(false);
    expect(users.u1.verifiedAt).toBeUndefined();
  });

  it("a valid token verifies once; replay is already_used", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "U1@x.com" } };
    const svc = build(users);
    const req = await svc.request("u1");
    expect(req?.email).toBe("u1@x.com"); // normalized, from the stored account email
    const t = req!.token;
    expect(t).toMatch(/^[a-f0-9]{64}$/);
    const ok = await svc.confirm(t);
    expect(ok).toEqual({ ok: true, userId: "u1" });
    expect(await svc.isVerified("u1")).toBe(true);
    expect(await svc.confirm(t)).toEqual({ ok: false, reason: "already_used" });
  });

  it("forged, malformed, and expired tokens fail safely", async () => {
    let clock = 1_000_000;
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users, () => clock);
    expect(await svc.confirm("forged")).toEqual({ ok: false, reason: "invalid" });
    expect(await svc.confirm("")).toEqual({ ok: false, reason: "invalid" });
    const t = (await svc.request("u1"))!.token;
    clock += 25 * 60 * 60 * 1000; // past 24h TTL
    expect(await svc.confirm(t)).toEqual({ ok: false, reason: "expired" });
  });

  it("a token is bound to the email: changing the account email invalidates it", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "old@x.com" } };
    const svc = build(users);
    const t = (await svc.request("u1"))!.token;
    // Email changes before the user confirms.
    users.u1.email = "new@x.com";
    await svc.onEmailChanged("u1");
    expect(await svc.confirm(t)).toMatchObject({ ok: false });
    expect(await svc.isVerified("u1")).toBe(false); // still unverified
  });

  it("changing the email clears prior verification and invalidates outstanding tokens", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "a@x.com" } };
    const svc = build(users);
    await svc.confirm((await svc.request("u1"))!.token);
    expect(await svc.isVerified("u1")).toBe(true);
    // A new outstanding token, then an email change.
    const t2 = (await svc.request("u1"))!.token;
    users.u1.email = "b@x.com";
    await svc.onEmailChanged("u1");
    expect(await svc.isVerified("u1")).toBe(false); // verification cleared
    expect(await svc.confirm(t2)).toMatchObject({ ok: false }); // token invalidated
  });

  it("one sibling token confirming invalidates the others", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users);
    const t1 = (await svc.request("u1"))!.token; // e.g. first send
    const t2 = (await svc.request("u1"))!.token; // resend
    expect((await svc.confirm(t2)).ok).toBe(true);
    expect(await svc.confirm(t1)).toEqual({ ok: false, reason: "already_used" });
  });

  it("a token for the WRONG user cannot verify another user", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" }, u2: { email: "u2@x.com" } };
    const svc = build(users);
    const t1 = (await svc.request("u1"))!.token;
    await svc.confirm(t1);
    expect(await svc.isVerified("u1")).toBe(true);
    expect(await svc.isVerified("u2")).toBe(false); // untouched
  });

  it("concurrent confirmation is idempotent (verified once)", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users);
    const t = (await svc.request("u1"))!.token;
    const [a, b] = await Promise.all([svc.confirm(t), svc.confirm(t)]);
    expect([a, b].filter((r) => r.ok).length).toBe(1);
    expect(await svc.isVerified("u1")).toBe(true);
  });

  it("request uses the account's stored email — the caller cannot choose a recipient", async () => {
    // The service exposes no recipient parameter; it only reads store.getEmail.
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "real@x.com" } };
    const svc = build(users);
    const req = await svc.request("u1");
    expect(req?.email).toBe("real@x.com");
  });
});

describe("EmailVerificationService — bounded sibling tokens", () => {
  // A clock that advances on each read, so successive tokens have distinct,
  // ordered created_at values (well-defined "oldest").
  function tickingClock(startMs = 1_000_000, stepMs = 1_000) {
    let t = startMs - stepMs;
    return () => {
      t += stepMs;
      return t;
    };
  }

  it("a resend does NOT invalidate the prior (possibly-delivered) link", async () => {
    // An uncertain SMTP acceptance must not strand the user: the earlier token
    // stays valid after another request.
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users, tickingClock());
    const t1 = (await svc.request("u1"))!.token;
    const t2 = (await svc.request("u1"))!.token;
    expect(t1).not.toBe(t2);
    // The FIRST link still verifies.
    expect((await svc.confirm(t1)).ok).toBe(true);
  });

  it("either sibling can verify", async () => {
    const usersA: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svcA = build(usersA, tickingClock());
    const a1 = (await svcA.request("u1"))!.token;
    await svcA.request("u1");
    expect((await svcA.confirm(a1)).ok).toBe(true); // the older one

    const usersB: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svcB = build(usersB, tickingClock());
    await svcB.request("u1");
    const b2 = (await svcB.request("u1"))!.token;
    expect((await svcB.confirm(b2)).ok).toBe(true); // the newer one
  });

  it("a successful confirmation invalidates all siblings", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users, tickingClock());
    const t1 = (await svc.request("u1"))!.token;
    const t2 = (await svc.request("u1"))!.token;
    const t3 = (await svc.request("u1"))!.token;
    expect((await svc.confirm(t2)).ok).toBe(true);
    expect(await svc.confirm(t1)).toEqual({ ok: false, reason: "already_used" });
    expect(await svc.confirm(t3)).toEqual({ ok: false, reason: "already_used" });
  });

  it("the active-token cap expires only the OLDEST", async () => {
    // Cap is 3. Mint 3, then a 4th request must expire ONLY the oldest (t1),
    // leaving t2/t3/t4 usable.
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users, tickingClock());
    const t1 = (await svc.request("u1"))!.token;
    const t2 = (await svc.request("u1"))!.token;
    const t3 = (await svc.request("u1"))!.token;
    const t4 = (await svc.request("u1"))!.token;
    // Oldest is gone…
    expect(await svc.confirm(t1)).toEqual({ ok: false, reason: "already_used" });
    // …but the newest three remain — and confirming any one works.
    expect((await svc.confirm(t3)).ok).toBe(true);
    // t2 and t4 are now siblings of a confirmed token → invalidated.
    expect((await svc.confirm(t2)).ok).toBe(false);
    expect((await svc.confirm(t4)).ok).toBe(false);
  });

  it("an email change invalidates every outstanding token", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "a@x.com" } };
    const svc = build(users, tickingClock());
    const t1 = (await svc.request("u1"))!.token;
    const t2 = (await svc.request("u1"))!.token;
    users.u1.email = "b@x.com";
    await svc.onEmailChanged("u1");
    expect((await svc.confirm(t1)).ok).toBe(false);
    expect((await svc.confirm(t2)).ok).toBe(false);
  });

  it("concurrent sibling confirmations verify exactly once", async () => {
    const users: Record<string, { email: string; verifiedAt?: string }> = { u1: { email: "u1@x.com" } };
    const svc = build(users, tickingClock());
    const t1 = (await svc.request("u1"))!.token;
    const t2 = (await svc.request("u1"))!.token;
    const [a, b] = await Promise.all([svc.confirm(t1), svc.confirm(t2)]);
    expect([a, b].filter((r) => r.ok).length).toBe(1);
    expect(await svc.isVerified("u1")).toBe(true);
  });
});
