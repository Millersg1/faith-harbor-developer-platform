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
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";
import { AiEmployeeRepository } from "./ai/employees/AiEmployeeRepository";
import {
  AiEmployeeService,
  AiEmployeeValidationError,
} from "./ai/employees/AiEmployeeService";
import { AiToolRegistry } from "./ai/tools/AiToolRegistry";
import { AiToolService } from "./ai/tools/AiToolService";
import { AiToolInvocationRepository } from "./ai/tools/AiToolInvocationRepository";
import type { AiToolDefinition } from "./ai/tools/AiToolTypes";
import { AiConsoleService } from "./ai/console/AiConsoleService";
import type {
  ChatCompletion,
  ChatMessage,
  ChatToolSpec,
} from "./ai/console/ChatClient";

describe("AiEmployeeService", () => {
  it("creates, validates, updates and removes employees, tenant-scoped", async () => {
    const svc = new AiEmployeeService(
      new AiEmployeeRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await expect(
          svc.create({ name: "  " }),
        ).rejects.toBeInstanceOf(
          AiEmployeeValidationError,
        );

        const emp = await svc.create({
          name: "Sales Assistant",
          title: "Sales",
          persona: "Be helpful.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.list",
            " ",
          ],
        });
        expect(emp.toolNames).toEqual([
          "crm.leads.list",
        ]);

        const updated =
          await svc.update(emp.id, {
            status: "archived",
          });
        expect(updated.status).toBe(
          "archived",
        );

        await svc.remove(emp.id);
        expect(
          await svc.list(),
        ).toHaveLength(0);
      },
    );
  });

  it("isolates employees per tenant", async () => {
    const svc = new AiEmployeeService(
      new AiEmployeeRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.create({
          name: "A",
        });
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.list(),
        ).toHaveLength(0);
      },
    );
  });
});

/** A chat client that records the tools it was offered, then just answers. */
class ToolCapturingClient {
  offered: string[] = [];
  system = "";

  isConnected(): boolean {
    return true;
  }

  async complete(
    messages: ChatMessage[],
    tools: ChatToolSpec[],
  ): Promise<ChatCompletion> {
    this.offered = tools.map(
      (t) => t.name,
    );
    this.system =
      messages[0]?.content ?? "";

    return {
      content: "ok",
      toolCalls: [],
    };
  }
}

describe("AI employees narrow the Command Center", () => {
  function registry(): AiToolRegistry {
    const reg = new AiToolRegistry();
    const mk = (
      name: string,
    ): AiToolDefinition => ({
      name,
      title: name,
      description: name,
      mode: "read",
      params: [],
      run: async () => ({
        ok: true,
        summary: "",
      }),
    });
    reg.register(mk("crm.leads.list"));
    reg.register(mk("clients.list"));
    reg.register(
      mk("projects.list"),
    );

    return reg;
  }

  it("restricts tools to the employee's whitelist and injects its persona", async () => {
    const reg = registry();
    const client =
      new ToolCapturingClient();
    const console = new AiConsoleService(
      reg,
      new AiToolService(
        reg,
        new AiToolInvocationRepository(),
      ),
      { defaultClient: client },
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await console.chat(
          "hi",
          [],
          { role: "owner" },
          {
            persona:
              "You are the leads-only bot.",
            toolNames: [
              "crm.leads.list",
            ],
          },
        );
      },
    );

    // Only the whitelisted tool was offered (dots become double underscores).
    expect(client.offered).toEqual([
      "crm__leads__list",
    ]);
    expect(client.system).toContain(
      "leads-only bot",
    );
  });

  it("a whitelist can only narrow, never grant tools the role lacks", async () => {
    const reg = new AiToolRegistry();
    reg.register({
      name: "admin.only",
      title: "admin only",
      description: "x",
      mode: "read",
      roles: ["owner", "admin"],
      params: [],
      run: async () => ({
        ok: true,
        summary: "",
      }),
    });
    const client =
      new ToolCapturingClient();
    const console = new AiConsoleService(
      reg,
      new AiToolService(
        reg,
        new AiToolInvocationRepository(),
      ),
      { defaultClient: client },
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        // A member whitelists a tool their role can't use — it stays hidden.
        await console.chat(
          "hi",
          [],
          { role: "member" },
          {
            toolNames: ["admin.only"],
          },
        );
      },
    );

    expect(client.offered).toEqual([]);
  });
});

async function buildApp() {
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
  const aiEmployees =
    new AiEmployeeService(
      new AiEmployeeRepository(),
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
    aiEmployees,
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

describe("AI employees API", () => {
  it("creates and lists an employee", async () => {
    const { app, cookie } =
      await buildApp();

    const created = await request(app)
      .post(
        "/api/platform/ai/employees",
      )
      .set("Cookie", cookie)
      .send({
        name: "Support Agent",
        persona: "Be kind.",
        toolNames: ["clients.list"],
      });
    expect(created.status).toBe(201);

    const list = await request(app)
      .get(
        "/api/platform/ai/employees",
      )
      .set("Cookie", cookie);
    expect(
      list.body.employees,
    ).toHaveLength(1);
    expect(
      list.body.employees[0].name,
    ).toBe("Support Agent");
  });

  it("rejects a nameless employee with 400", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .post(
        "/api/platform/ai/employees",
      )
      .set("Cookie", cookie)
      .send({ persona: "x" });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/ai/employees",
    );
    expect(res.status).toBe(401);
  });
});
