import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import {
  AiToolRegistry,
  AiToolNotFoundError,
  AiToolValidationError,
} from "./ai/tools/AiToolRegistry";
import {
  AiToolForbiddenError,
  AiToolService,
} from "./ai/tools/AiToolService";
import { AiToolInvocationRepository } from "./ai/tools/AiToolInvocationRepository";
import type { AiToolDefinition } from "./ai/tools/AiToolTypes";

function readTool(
  calls: string[],
): AiToolDefinition {
  return {
    name: "demo.read",
    title: "Read demo",
    description: "A read tool.",
    mode: "read",
    params: [],
    run: async () => {
      calls.push("read");

      return {
        ok: true,
        summary: "read ran",
      };
    },
  };
}

function writeTool(
  calls: string[],
): AiToolDefinition {
  return {
    name: "demo.write",
    title: "Write demo",
    description: "A write tool.",
    mode: "write",
    roles: ["owner", "admin"],
    params: [
      {
        name: "value",
        type: "string",
        description: "A value.",
        required: true,
      },
    ],
    run: async (args) => {
      calls.push(
        `write:${String(args.value)}`,
      );

      return {
        ok: true,
        summary: "write ran",
      };
    },
  };
}

function makeService(calls: string[]) {
  const registry = new AiToolRegistry();
  registry.register(readTool(calls));
  registry.register(writeTool(calls));

  return new AiToolService(
    registry,
    new AiToolInvocationRepository(),
  );
}

describe("AiToolRegistry", () => {
  it("filters tools by role and validates args", () => {
    const registry =
      new AiToolRegistry();
    registry.register(writeTool([]));

    expect(
      registry
        .describe("member")
        .map((t) => t.name),
    ).toEqual([]);
    expect(
      registry
        .describe("owner")
        .map((t) => t.name),
    ).toEqual(["demo.write"]);

    const tool = registry.get(
      "demo.write",
    )!;
    expect(() =>
      registry.validate(tool, {}),
    ).toThrow(/required/i);
    expect(
      registry.validate(tool, {
        value: 42,
        extra: "dropped",
      }),
    ).toEqual({ value: "42" });
  });
});

describe("AiToolService", () => {
  it("runs a read tool immediately and records it executed", async () => {
    const calls: string[] = [];
    const svc = makeService(calls);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const outcome =
          await svc.invoke(
            "demo.read",
            {},
            { role: "member" },
          );

        expect(outcome.status).toBe(
          "executed",
        );
        expect(
          outcome.result?.summary,
        ).toBe("read ran");
        expect(calls).toEqual(["read"]);

        const list =
          await svc.listInvocations();
        expect(list).toHaveLength(1);
        expect(list[0].status).toBe(
          "executed",
        );
      },
    );
  });

  it("proposes a write tool without running it until confirmed", async () => {
    const calls: string[] = [];
    const svc = makeService(calls);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const proposed =
          await svc.invoke(
            "demo.write",
            { value: "hi" },
            {
              role: "owner",
              actorId: "u1",
            },
          );

        expect(proposed.status).toBe(
          "pending",
        );
        // Nothing ran yet — this is the whole safety property.
        expect(calls).toEqual([]);

        const confirmed =
          await svc.confirm(
            proposed.invocation.id,
            { role: "owner" },
          );

        expect(confirmed.status).toBe(
          "executed",
        );
        expect(calls).toEqual([
          "write:hi",
        ]);

        // Confirming again fails — no double execution.
        await expect(
          svc.confirm(
            proposed.invocation.id,
            { role: "owner" },
          ),
        ).rejects.toThrow(
          /no longer pending/i,
        );
        expect(calls).toEqual([
          "write:hi",
        ]);
      },
    );
  });

  it("rejects a pending write without running it", async () => {
    const calls: string[] = [];
    const svc = makeService(calls);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const proposed =
          await svc.invoke(
            "demo.write",
            { value: "x" },
            { role: "admin" },
          );
        const rejected =
          await svc.reject(
            proposed.invocation.id,
            { role: "owner" },
          );

        expect(rejected.status).toBe(
          "rejected",
        );
        expect(calls).toEqual([]);
      },
    );
  });

  it("forbids a role that isn't allowed to use a tool", async () => {
    const calls: string[] = [];
    const svc = makeService(calls);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await expect(
          svc.invoke(
            "demo.write",
            { value: "x" },
            { role: "member" },
          ),
        ).rejects.toBeInstanceOf(
          AiToolForbiddenError,
        );
        expect(calls).toEqual([]);
      },
    );
  });

  it("keeps invocations isolated per tenant", async () => {
    const calls: string[] = [];
    const svc = makeService(calls);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.invoke(
          "demo.read",
          {},
          { role: "member" },
        );
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.listInvocations(),
        ).toHaveLength(0);
      },
    );
  });
});

describe("AiToolService approval security", () => {
  function serviceWith(
    calls: string[],
    opts: {
      now?: () => number;
      proposalTtlMs?: number;
    },
  ) {
    const registry = new AiToolRegistry();
    registry.register(readTool(calls));
    registry.register(writeTool(calls));

    return new AiToolService(
      registry,
      new AiToolInvocationRepository(),
      opts,
    );
  }

  it("expires a stale proposal instead of running it", async () => {
    const calls: string[] = [];
    // Stamp the proposal two hours in the past, with a one-minute TTL.
    const twoHoursAgo =
      Date.now() - 2 * 60 * 60 * 1000;
    const svc = serviceWith(calls, {
      now: () => twoHoursAgo,
      proposalTtlMs: 60 * 1000,
    });

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const proposed =
          await svc.invoke(
            "demo.write",
            { value: "old" },
            { role: "owner" },
          );

        await expect(
          svc.confirm(
            proposed.invocation.id,
            { role: "owner" },
          ),
        ).rejects.toBeInstanceOf(
          AiToolValidationError,
        );
        // The stale write never executed.
        expect(calls).toEqual([]);

        const stored =
          await svc.listInvocations();
        expect(stored[0].status).toBe(
          "expired",
        );
      },
    );
  });

  it("re-checks the acting role at confirmation time", async () => {
    const calls: string[] = [];
    const svc = serviceWith(calls, {});

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const proposed =
          await svc.invoke(
            "demo.write",
            { value: "x" },
            { role: "owner" },
          );

        // A member cannot confirm an owner/admin-only write, even though the
        // proposal already exists — the role is re-authorized on confirm.
        await expect(
          svc.confirm(
            proposed.invocation.id,
            { role: "member" },
          ),
        ).rejects.toBeInstanceOf(
          AiToolForbiddenError,
        );
        expect(calls).toEqual([]);
      },
    );
  });

  it("will not confirm another tenant's proposal", async () => {
    const calls: string[] = [];
    const svc = serviceWith(calls, {});

    const id = await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const proposed =
          await svc.invoke(
            "demo.write",
            { value: "secret" },
            { role: "owner" },
          );

        return proposed.invocation.id;
      },
    );

    // The same id is invisible — and unconfirmable — from another tenant.
    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        await expect(
          svc.confirm(id, {
            role: "owner",
          }),
        ).rejects.toBeInstanceOf(
          AiToolNotFoundError,
        );
        expect(calls).toEqual([]);
      },
    );
  });

  it("executes the server-stored args, not any later substitution", async () => {
    const calls: string[] = [];
    const svc = serviceWith(calls, {});

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const proposed =
          await svc.invoke(
            "demo.write",
            { value: "original" },
            { role: "owner" },
          );

        // confirm() takes no args — the payload is bound at proposal time.
        await svc.confirm(
          proposed.invocation.id,
          { role: "owner" },
        );

        expect(calls).toEqual([
          "write:original",
        ]);
      },
    );
  });
});

async function buildApp(calls: string[]) {
  const organizations =
    new OrganizationService();
  const users =
    new PlatformUserService(
      new PlatformUserRepository(),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );
  const registry = new AiToolRegistry();
  registry.register(readTool(calls));
  registry.register(writeTool(calls));
  const aiTools = new AiToolService(
    registry,
    new AiToolInvocationRepository(),
  );

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(
      new BrandingRepository(),
    ),
    clients,
    projects:
      new PlatformProjectService(
        new PlatformProjectRepository(),
        clients,
      ),
    invoices:
      new PlatformInvoiceService(
        new PlatformInvoiceRepository(),
        clients,
      ),
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
    aiTools,
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      slug: "acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    cookie:
      signup.headers["set-cookie"],
  };
}

describe("AI tools API", () => {
  it("lists tools and runs a read tool", async () => {
    const calls: string[] = [];
    const { app, cookie } =
      await buildApp(calls);

    const list = await request(app)
      .get("/api/platform/ai/tools")
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(
      list.body.tools.map(
        (t: { name: string }) =>
          t.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "demo.read",
        "demo.write",
      ]),
    );

    const run = await request(app)
      .post(
        "/api/platform/ai/tools/demo.read/invoke",
      )
      .set("Cookie", cookie)
      .send({});
    expect(run.status).toBe(200);
    expect(run.body.status).toBe(
      "executed",
    );
    expect(calls).toEqual(["read"]);
  });

  it("proposes a write tool (202) and confirms it", async () => {
    const calls: string[] = [];
    const { app, cookie } =
      await buildApp(calls);

    const proposed = await request(app)
      .post(
        "/api/platform/ai/tools/demo.write/invoke",
      )
      .set("Cookie", cookie)
      .send({ args: { value: "hi" } });
    expect(proposed.status).toBe(202);
    expect(proposed.body.status).toBe(
      "pending",
    );
    expect(calls).toEqual([]);

    const id =
      proposed.body.invocation.id;
    const confirmed = await request(app)
      .post(
        `/api/platform/ai/tools/invocations/${id}/confirm`,
      )
      .set("Cookie", cookie)
      .send({});
    expect(confirmed.status).toBe(200);
    expect(calls).toEqual(["write:hi"]);
  });

  it("ignores client-supplied args at confirm time (payload binding)", async () => {
    const calls: string[] = [];
    const { app, cookie } =
      await buildApp(calls);

    const proposed = await request(app)
      .post(
        "/api/platform/ai/tools/demo.write/invoke",
      )
      .set("Cookie", cookie)
      .send({ args: { value: "hi" } });
    const id =
      proposed.body.invocation.id;

    // Attempt to substitute a different payload on confirm.
    const confirmed = await request(app)
      .post(
        `/api/platform/ai/tools/invocations/${id}/confirm`,
      )
      .set("Cookie", cookie)
      .send({ args: { value: "evil" } });

    expect(confirmed.status).toBe(200);
    // The originally-proposed value ran — not the substituted one.
    expect(calls).toEqual(["write:hi"]);
  });

  it("rejects a missing required arg with 400", async () => {
    const calls: string[] = [];
    const { app, cookie } =
      await buildApp(calls);

    const res = await request(app)
      .post(
        "/api/platform/ai/tools/demo.write/invoke",
      )
      .set("Cookie", cookie)
      .send({ args: {} });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const calls: string[] = [];
    const { app } =
      await buildApp(calls);

    const res = await request(app).get(
      "/api/platform/ai/tools",
    );
    expect(res.status).toBe(401);
  });
});
