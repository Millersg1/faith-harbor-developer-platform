import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { toPublicUser } from "./PlatformUser";
import { PlatformUserRepository } from "./PlatformUserRepository";
import { PlatformUserService } from "./PlatformUserService";

const A = { organizationId: "org-a" };
const B = { organizationId: "org-b" };

describe("PlatformUser auth + tenant isolation", () => {
  it("fails closed without a tenant", async () => {
    const svc =
      new PlatformUserService();

    await expect(
      svc.create({
        email: "a@x.com",
        password: "password1",
      }),
    ).rejects.toThrow(/no tenant/i);
  });

  it("creates a user and authenticates with the right password", async () => {
    const svc =
      new PlatformUserService();

    await runWithTenant(A, () =>
      svc.create({
        email: "Owner@Acme.com",
        password: "password123",
        role: "owner",
      }),
    );

    const user = await runWithTenant(
      A,
      () =>
        svc.authenticate(
          "owner@acme.com",
          "password123",
        ),
    );

    expect(user.role).toBe("owner");
    // Email is normalized to lowercase.
    expect(user.email).toBe(
      "owner@acme.com",
    );
  });

  it("rejects a wrong password and an unknown email uniformly", async () => {
    const svc =
      new PlatformUserService();

    await runWithTenant(A, () =>
      svc.create({
        email: "a@x.com",
        password: "password123",
      }),
    );

    await expect(
      runWithTenant(A, () =>
        svc.authenticate(
          "a@x.com",
          "wrongpassword",
        ),
      ),
    ).rejects.toThrow(/invalid/i);

    await expect(
      runWithTenant(A, () =>
        svc.authenticate(
          "nobody@x.com",
          "whatever12",
        ),
      ),
    ).rejects.toThrow(/invalid/i);
  });

  it("treats the same email in two orgs as separate accounts", async () => {
    const svc =
      new PlatformUserService();

    const a = await runWithTenant(
      A,
      () =>
        svc.create({
          email: "sam@x.com",
          password: "passwordAAA",
        }),
    );
    const b = await runWithTenant(
      B,
      () =>
        svc.create({
          email: "sam@x.com",
          password: "passwordBBB",
        }),
    );

    expect(a.id).not.toBe(b.id);
    expect(a.organizationId).toBe(
      "org-a",
    );

    // A's password authenticates in A...
    const inA = await runWithTenant(
      A,
      () =>
        svc.authenticate(
          "sam@x.com",
          "passwordAAA",
        ),
    );
    expect(inA.id).toBe(a.id);

    // ...but not in B, whose account has a different password.
    await expect(
      runWithTenant(B, () =>
        svc.authenticate(
          "sam@x.com",
          "passwordAAA",
        ),
      ),
    ).rejects.toThrow(/invalid/i);
  });

  it("cannot authenticate a user that exists only in another tenant", async () => {
    const svc =
      new PlatformUserService();

    await runWithTenant(A, () =>
      svc.create({
        email: "only-a@x.com",
        password: "password123",
      }),
    );

    await expect(
      runWithTenant(B, () =>
        svc.authenticate(
          "only-a@x.com",
          "password123",
        ),
      ),
    ).rejects.toThrow(/invalid/i);
  });

  it("rejects a duplicate email within the same org", async () => {
    const svc =
      new PlatformUserService();

    await runWithTenant(A, () =>
      svc.create({
        email: "dup@x.com",
        password: "password123",
      }),
    );

    await expect(
      runWithTenant(A, () =>
        svc.create({
          email: "dup@x.com",
          password: "password456",
        }),
      ),
    ).rejects.toThrow(
      /already exists/i,
    );
  });

  it("reveals suspension only once the password is correct", async () => {
    const repo =
      new PlatformUserRepository();
    const svc = new PlatformUserService(
      repo,
    );

    const user = await runWithTenant(
      A,
      () =>
        svc.create({
          email: "sus@x.com",
          password: "password123",
        }),
    );

    await runWithTenant(A, () =>
      repo.update({
        ...user,
        status: "suspended",
      }),
    );

    // Correct password -> the account is revealed as suspended.
    await expect(
      runWithTenant(A, () =>
        svc.authenticate(
          "sus@x.com",
          "password123",
        ),
      ),
    ).rejects.toThrow(/suspended/i);

    // Wrong password -> still just "invalid", no suspension leak.
    await expect(
      runWithTenant(A, () =>
        svc.authenticate(
          "sus@x.com",
          "wrongpass1",
        ),
      ),
    ).rejects.toThrow(/invalid/i);
  });

  it("never exposes the password hash in the public projection", async () => {
    const svc =
      new PlatformUserService();

    const user = await runWithTenant(
      A,
      () =>
        svc.create({
          email: "safe@x.com",
          password: "password123",
        }),
    );

    const publicUser =
      toPublicUser(user);

    expect(
      "passwordHash" in publicUser,
    ).toBe(false);
    expect(user.passwordHash).toBeTruthy();
  });
});
