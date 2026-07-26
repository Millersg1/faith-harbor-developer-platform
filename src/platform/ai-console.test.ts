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
import { AiToolRegistry } from "./ai/tools/AiToolRegistry";
import { AiToolService } from "./ai/tools/AiToolService";
import { AiToolInvocationRepository } from "./ai/tools/AiToolInvocationRepository";
import type { AiToolDefinition } from "./ai/tools/AiToolTypes";
import { AiConsoleService } from "./ai/console/AiConsoleService";
import {
  DisconnectedChatClient,
  type ChatClient,
  type ChatCompletion,
} from "./ai/console/ChatClient";

/** A chat client that replays a fixed script of completions in order. */
class ScriptedChatClient
  implements ChatClient
{
  private i = 0;

  constructor(
    private readonly script: ChatCompletion[],
  ) {}

  isConnected(): boolean {
    return true;
  }

  async complete(): Promise<ChatCompletion> {
    const next =
      this.script[this.i] ??
      this.script[
        this.script.length - 1
      ];
    this.i += 1;

    return next;
  }
}

function tools(calls: string[]): {
  registry: AiToolRegistry;
} {
  const read: AiToolDefinition = {
    name: "demo.read",
    title: "Read demo",
    description: "Reads a count.",
    mode: "read",
    params: [],
    run: async () => {
      calls.push("read");

      return {
        ok: true,
        summary: "7 things.",
        data: { count: 7 },
      };
    },
  };
  const write: AiToolDefinition = {
    name: "demo.write",
    title: "Write demo",
    description: "Changes a thing.",
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
        summary: "wrote it",
      };
    },
  };

  const registry =
    new AiToolRegistry();
  registry.register(read);
  registry.register(write);

  return { registry };
}

function service(
  calls: string[],
  script: ChatCompletion[],
  client?: ChatClient,
): AiConsoleService {
  const { registry } = tools(calls);
  const aiTools = new AiToolService(
    registry,
    new AiToolInvocationRepository(),
  );

  return new AiConsoleService(
    registry,
    aiTools,
    {
      defaultClient:
        client ??
        new ScriptedChatClient(script),
    },
  );
}

describe("AiConsoleService", () => {
  it("runs a read tool then answers from its result", async () => {
    const calls: string[] = [];
    const svc = service(calls, [
      {
        content: "",
        toolCalls: [
          {
            id: "c1",
            name: "demo.read",
            arguments: {},
          },
        ],
      },
      {
        content: "You have 7 things.",
        toolCalls: [],
      },
    ]);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const reply = await svc.chat(
          "how many things?",
          [],
          { role: "member" },
        );

        expect(reply.available).toBe(
          true,
        );
        expect(reply.reply).toBe(
          "You have 7 things.",
        );
        expect(calls).toEqual(["read"]);
        expect(
          reply.steps[0],
        ).toMatchObject({
          tool: "demo.read",
          mode: "read",
        });
        expect(
          reply.pending,
        ).toHaveLength(0);
      },
    );
  });

  it("proposes a write tool without running it", async () => {
    const calls: string[] = [];
    const svc = service(calls, [
      {
        content: "",
        toolCalls: [
          {
            id: "c1",
            name: "demo.write",
            arguments: {
              value: "x",
            },
          },
        ],
      },
      {
        content:
          "I've queued that for your confirmation.",
        toolCalls: [],
      },
    ]);

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const reply = await svc.chat(
          "change the thing",
          [],
          { role: "owner" },
        );

        // The whole point: the write did NOT run.
        expect(calls).toEqual([]);
        expect(
          reply.pending,
        ).toHaveLength(1);
        expect(
          reply.pending[0].toolName,
        ).toBe("demo.write");
        expect(
          reply.pending[0].status,
        ).toBe("pending");
        expect(
          reply.steps[0].mode,
        ).toBe("write");
      },
    );
  });

  it("reports unavailable when no client is connected", async () => {
    const calls: string[] = [];
    const svc = service(
      calls,
      [],
      new DisconnectedChatClient(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const reply = await svc.chat(
          "hi",
          [],
          { role: "owner" },
        );

        expect(reply.available).toBe(
          false,
        );
        expect(calls).toEqual([]);
      },
    );
  });
});

async function buildApp(
  calls: string[],
  script: ChatCompletion[],
) {
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
  const { registry } = tools(calls);
  const aiTools = new AiToolService(
    registry,
    new AiToolInvocationRepository(),
  );
  const aiConsole =
    new AiConsoleService(
      registry,
      aiTools,
      {
        defaultClient:
          new ScriptedChatClient(
            script,
          ),
      },
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
    aiConsole,
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

describe("AI console API", () => {
  it("answers a chat message", async () => {
    const calls: string[] = [];
    const { app, cookie } =
      await buildApp(calls, [
        {
          content: "Hello there.",
          toolCalls: [],
        },
      ]);

    const res = await request(app)
      .post(
        "/api/platform/ai/console/chat",
      )
      .set("Cookie", cookie)
      .send({ message: "hi" });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe(
      "Hello there.",
    );
    expect(res.body.available).toBe(
      true,
    );
  });

  it("rejects an empty message with 400", async () => {
    const { app, cookie } =
      await buildApp([], [
        {
          content: "x",
          toolCalls: [],
        },
      ]);

    const res = await request(app)
      .post(
        "/api/platform/ai/console/chat",
      )
      .set("Cookie", cookie)
      .send({ message: "  " });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const { app } = await buildApp([], [
      { content: "x", toolCalls: [] },
    ]);

    const res = await request(app)
      .post(
        "/api/platform/ai/console/chat",
      )
      .send({ message: "hi" });
    expect(res.status).toBe(401);
  });
});
