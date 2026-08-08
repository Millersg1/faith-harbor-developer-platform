import { describe, expect, it } from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import {
  EmailVerificationService,
  EmailVerificationTokenRepository,
} from "./EmailVerificationService";
import { PlatformUserVerificationStore } from "./PlatformUserVerificationStore";

async function seedUser(
  repo: PlatformUserRepository,
  org: string,
  email: string,
): Promise<string> {
  let id = "";
  await runWithTenant({ organizationId: org }, async () => {
    const u = await repo.create({
      id: `u_${email}`,
      email,
      passwordHash: "x",
      role: "owner",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    id = u.id;
  });
  return id;
}

describe("PlatformUserVerificationStore — atomic verify vs email-change race", () => {
  it("markVerified succeeds when the email matches; fails when it has changed", async () => {
    const repo = new PlatformUserRepository();
    const id = await seedUser(repo, "orgA", "user@x.com");
    const store = new PlatformUserVerificationStore(repo);

    // Email changed to something else → a token bound to the OLD email cannot verify.
    expect(
      await store.markVerified(id, "user@x.com", "2026-02-01T00:00:00.000Z"),
    ).toBe(true);
    // Already verified → a second mark is a no-op (idempotent guard).
    expect(
      await store.markVerified(id, "user@x.com", "2026-03-01T00:00:00.000Z"),
    ).toBe(false);
    expect(await store.isVerified(id)).toBe(true);
  });

  it("a bound email that no longer matches the account fails safe", async () => {
    const repo = new PlatformUserRepository();
    const id = await seedUser(repo, "orgA", "current@x.com");
    const store = new PlatformUserVerificationStore(repo);
    // Token bound to a stale email → mark refuses.
    expect(
      await store.markVerified(id, "stale@x.com", "2026-02-01T00:00:00.000Z"),
    ).toBe(false);
    expect(await store.isVerified(id)).toBe(false);
  });

  it("changing the account email via repo.update clears verification", async () => {
    const repo = new PlatformUserRepository();
    const id = await seedUser(repo, "orgA", "a@x.com");
    const store = new PlatformUserVerificationStore(repo);
    await store.markVerified(id, "a@x.com", "2026-02-01T00:00:00.000Z");
    expect(await store.isVerified(id)).toBe(true);
    // Update the email → verification must clear atomically.
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const u = (await repo.getByIdUnscoped(id))!;
      await repo.update({ ...u, email: "b@x.com", updatedAt: "2026-02-02T00:00:00.000Z" });
    });
    expect(await store.isVerified(id)).toBe(false);
  });

  it("end-to-end: EmailVerificationService confirm works over the real repo", async () => {
    const repo = new PlatformUserRepository();
    const id = await seedUser(repo, "orgA", "dana@x.com");
    const svc = new EmailVerificationService(
      new PlatformUserVerificationStore(repo),
      new EmailVerificationTokenRepository(),
    );
    const req = await svc.request(id);
    expect(req?.email).toBe("dana@x.com");
    expect(await svc.confirm(req!.token)).toEqual({ ok: true, userId: id });
    expect(await svc.isVerified(id)).toBe(true);
    // A token minted before an email change can't verify the new address.
    const req2 = await svc.request(id);
    await runWithTenant({ organizationId: "orgA" }, async () => {
      const u = (await repo.getByIdUnscoped(id))!;
      await repo.update({ ...u, email: "moved@x.com", updatedAt: "2026-03-01T00:00:00.000Z" });
    });
    expect(await svc.confirm(req2!.token)).toMatchObject({ ok: false });
    expect(await svc.isVerified(id)).toBe(false); // cleared by the email change
  });
});
