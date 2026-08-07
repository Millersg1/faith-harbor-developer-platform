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
      const u = users[id];
      if (!u || u.email.trim().toLowerCase() !== email) return false;
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
