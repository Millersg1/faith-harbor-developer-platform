import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformClientRepository } from "./PlatformClientRepository";
import { PlatformClientService } from "./PlatformClientService";

const A = { organizationId: "org-a" };
const B = { organizationId: "org-b" };

/**
 * One service instance shared across tenants, so the tests prove that
 * isolation comes from the tenant scope — not from using separate stores.
 */
function service(): PlatformClientService {
  return new PlatformClientService(
    new PlatformClientRepository(),
  );
}

describe("PlatformClient tenant isolation", () => {
  it("fails closed: no tenant in scope means no access", async () => {
    const svc = service();

    await expect(
      svc.create({ name: "X" }),
    ).rejects.toThrow(/no tenant/i);

    await expect(
      svc.list(),
    ).rejects.toThrow(/no tenant/i);
  });

  it("stamps the organization from context, not from the caller", async () => {
    const svc = service();

    const client =
      await runWithTenant(B, () =>
        svc.create({
          name: "Bob",
        }),
      );

    expect(
      client.organizationId,
    ).toBe("org-b");
  });

  it("isolates each tenant's client list", async () => {
    const svc = service();

    await runWithTenant(A, () =>
      svc.create({ name: "Alice" }),
    );
    await runWithTenant(A, () =>
      svc.create({ name: "Aaron" }),
    );
    await runWithTenant(B, () =>
      svc.create({ name: "Bob" }),
    );

    const aList =
      await runWithTenant(A, () =>
        svc.list(),
      );
    const bList =
      await runWithTenant(B, () =>
        svc.list(),
      );

    expect(
      aList
        .map((c) => c.name)
        .sort(),
    ).toEqual(["Aaron", "Alice"]);
    expect(
      bList.map((c) => c.name),
    ).toEqual(["Bob"]);
    expect(
      aList.every(
        (c) =>
          c.organizationId ===
          "org-a",
      ),
    ).toBe(true);
  });

  it("cannot read another tenant's client by id", async () => {
    const svc = service();

    const a = await runWithTenant(
      A,
      () =>
        svc.create({
          name: "Secret A",
        }),
    );

    // B sees nothing and cannot fetch A's client even with its id.
    await expect(
      runWithTenant(B, () =>
        svc.get(a.id),
      ),
    ).rejects.toThrow(/not found/i);

    // A can, of course, read its own.
    const byA = await runWithTenant(
      A,
      () => svc.get(a.id),
    );
    expect(byA.name).toBe("Secret A");
  });

  it("cannot modify or delete another tenant's client", async () => {
    const svc = service();

    const a = await runWithTenant(
      A,
      () =>
        svc.create({
          name: "Owned by A",
        }),
    );

    // B's update targeting A's id is rejected (it isn't B's to see).
    await expect(
      runWithTenant(B, () =>
        svc.update(a.id, {
          name: "Hacked",
        }),
      ),
    ).rejects.toThrow(/not found/i);

    // B's delete of A's id is a silent no-op, not a cross-tenant delete.
    await runWithTenant(B, () =>
      svc.delete(a.id),
    );

    const stillThere =
      await runWithTenant(A, () =>
        svc.get(a.id),
      );
    expect(stillThere.name).toBe(
      "Owned by A",
    );
  });

  it("updates and deletes within the tenant", async () => {
    const svc = service();

    const a = await runWithTenant(
      A,
      () =>
        svc.create({
          name: "Acme",
          email: "x@acme.com",
        }),
    );

    const updated =
      await runWithTenant(A, () =>
        svc.update(a.id, {
          company: "Acme Inc",
          status: "archived",
        }),
      );

    expect(updated.company).toBe(
      "Acme Inc",
    );
    expect(updated.status).toBe(
      "archived",
    );
    expect(updated.email).toBe(
      "x@acme.com",
    );

    await runWithTenant(A, () =>
      svc.delete(a.id),
    );

    const after = await runWithTenant(
      A,
      () => svc.list(),
    );
    expect(after).toHaveLength(0);
  });
});
