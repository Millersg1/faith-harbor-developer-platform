import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../../tenancy/TenantContext";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { PlatformProjectRepository } from "./PlatformProjectRepository";
import { PlatformProjectService } from "./PlatformProjectService";

const A = { organizationId: "org-a" };
const B = { organizationId: "org-b" };

function setup() {
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );

  const projects =
    new PlatformProjectService(
      new PlatformProjectRepository(),
      clients,
    );

  return { clients, projects };
}

describe("PlatformProject tenant isolation", () => {
  it("fails closed without a tenant", async () => {
    const { projects } = setup();

    await expect(
      projects.create({
        name: "X",
      }),
    ).rejects.toThrow(/no tenant/i);

    await expect(
      projects.list(),
    ).rejects.toThrow(/no tenant/i);
  });

  it("isolates each tenant's projects", async () => {
    const { projects } = setup();

    await runWithTenant(A, () =>
      projects.create({
        name: "Alpha",
      }),
    );
    await runWithTenant(B, () =>
      projects.create({
        name: "Beta",
      }),
    );

    const aList =
      await runWithTenant(A, () =>
        projects.list(),
      );
    const bList =
      await runWithTenant(B, () =>
        projects.list(),
      );

    expect(
      aList.map((p) => p.name),
    ).toEqual(["Alpha"]);
    expect(
      bList.map((p) => p.name),
    ).toEqual(["Beta"]);
  });

  it("cannot read, update, or delete another tenant's project", async () => {
    const { projects } = setup();

    const a = await runWithTenant(
      A,
      () =>
        projects.create({
          name: "Owned by A",
        }),
    );

    await expect(
      runWithTenant(B, () =>
        projects.get(a.id),
      ),
    ).rejects.toThrow(/not found/i);

    await expect(
      runWithTenant(B, () =>
        projects.update(a.id, {
          name: "Hacked",
        }),
      ),
    ).rejects.toThrow(/not found/i);

    await runWithTenant(B, () =>
      projects.delete(a.id),
    );

    const stillThere =
      await runWithTenant(A, () =>
        projects.get(a.id),
      );
    expect(stillThere.name).toBe(
      "Owned by A",
    );
  });

  it("attaches a project to a client in the same tenant", async () => {
    const { clients, projects } =
      setup();

    const client = await runWithTenant(
      A,
      () =>
        clients.create({
          name: "A Client",
        }),
    );

    const project =
      await runWithTenant(A, () =>
        projects.create({
          name: "Website",
          clientId: client.id,
        }),
      );

    expect(project.clientId).toBe(
      client.id,
    );
  });

  it("cannot attach a project to another tenant's client", async () => {
    const { clients, projects } =
      setup();

    const bClient = await runWithTenant(
      B,
      () =>
        clients.create({
          name: "B Client",
        }),
    );

    // Acting as A, referencing B's client id is rejected — from A's
    // vantage that client does not exist.
    await expect(
      runWithTenant(A, () =>
        projects.create({
          name: "Cross-tenant",
          clientId: bClient.id,
        }),
      ),
    ).rejects.toThrow(/not found/i);
  });
});
