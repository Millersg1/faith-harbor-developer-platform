import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "./OrganizationService";

describe("OrganizationService", () => {
  it("creates an organization and derives a slug from the name", async () => {
    const service =
      new OrganizationService();

    const org = await service.create({
      name: "Acme Widgets",
    });

    expect(org.id).toBeTruthy();
    expect(org.name).toBe(
      "Acme Widgets",
    );
    expect(org.slug).toBe(
      "acme-widgets",
    );
    expect(org.status).toBe("active");
  });

  it("honors an explicit slug", async () => {
    const service =
      new OrganizationService();

    const org = await service.create({
      name: "Faith Harbor",
      slug: "faith-harbor",
    });

    expect(org.slug).toBe(
      "faith-harbor",
    );
  });

  it("rejects a blank name", async () => {
    const service =
      new OrganizationService();

    await expect(
      service.create({ name: "   " }),
    ).rejects.toThrow(/name/i);
  });

  it("rejects a name with no usable slug characters", async () => {
    const service =
      new OrganizationService();

    await expect(
      service.create({ name: "!!!" }),
    ).rejects.toThrow(/slug/i);
  });

  it("rejects a duplicate slug", async () => {
    const service =
      new OrganizationService();

    await service.create({
      name: "Acme",
    });

    await expect(
      service.create({
        name: "Acme",
      }),
    ).rejects.toThrow(
      /already in use/i,
    );
  });

  it("looks an organization up by id and by slug", async () => {
    const service =
      new OrganizationService();

    const created =
      await service.create({
        name: "JC Football Elite",
      });

    const byId = await service.get(
      created.id,
    );
    expect(byId.name).toBe(
      "JC Football Elite",
    );

    const bySlug =
      await service.getBySlug(
        "jc-football-elite",
      );
    expect(bySlug?.id).toBe(
      created.id,
    );

    // Slug lookup normalizes input (e.g. from a raw subdomain).
    const byMessySlug =
      await service.getBySlug(
        "JC Football Elite",
      );
    expect(byMessySlug?.id).toBe(
      created.id,
    );
  });

  it("throws when getting a missing organization", async () => {
    const service =
      new OrganizationService();

    await expect(
      service.get("does-not-exist"),
    ).rejects.toThrow(/not found/i);
  });

  it("lists organizations and updates name and status", async () => {
    const service =
      new OrganizationService();

    const a = await service.create({
      name: "Alpha",
    });
    await service.create({
      name: "Beta",
    });

    const all = await service.list();
    expect(all).toHaveLength(2);

    const updated =
      await service.update(a.id, {
        name: "Alpha Renamed",
        status: "suspended",
      });

    expect(updated.name).toBe(
      "Alpha Renamed",
    );
    expect(updated.status).toBe(
      "suspended",
    );
    // Slug stays stable across a rename so the subdomain never breaks.
    expect(updated.slug).toBe("alpha");
  });
});
