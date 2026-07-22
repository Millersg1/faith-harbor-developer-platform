import {
  describe,
  expect,
  it,
} from "vitest";

import {
  currentTenant,
  requireTenant,
  runWithTenant,
} from "./TenantContext";

describe("TenantContext", () => {
  it("has no tenant outside a scope", () => {
    expect(
      currentTenant(),
    ).toBeUndefined();
  });

  it("fails closed: requireTenant throws with no tenant in scope", () => {
    expect(() =>
      requireTenant(),
    ).toThrow(/no tenant/i);
  });

  it("exposes the tenant inside runWithTenant", () => {
    const seen = runWithTenant(
      { organizationId: "org-123" },
      () => {
        return requireTenant()
          .organizationId;
      },
    );

    expect(seen).toBe("org-123");
    // Scope is cleaned up afterwards.
    expect(
      currentTenant(),
    ).toBeUndefined();
  });

  it("keeps the tenant across async boundaries", async () => {
    const seen = await runWithTenant(
      { organizationId: "org-async" },
      async () => {
        await Promise.resolve();
        return currentTenant()
          ?.organizationId;
      },
    );

    expect(seen).toBe("org-async");
  });
});
