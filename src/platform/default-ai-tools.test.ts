import {
  describe,
  expect,
  it,
} from "vitest";

import { buildDefaultAiTools } from "./ai/tools/defaultAiTools";
import type { AiToolContext } from "./ai/tools/AiToolTypes";

const CTX: AiToolContext = {
  role: "owner",
};

function byName(
  tools: ReturnType<
    typeof buildDefaultAiTools
  >,
) {
  return new Map(
    tools.map((t) => [t.name, t]),
  );
}

describe("buildDefaultAiTools", () => {
  it("registers the expected tools with correct read/write modes", () => {
    const created: string[] = [];
    const tools = buildDefaultAiTools({
      leads: {
        list: async () => [],
        create: async (i) => {
          created.push(i.name);

          return {
            id: "l1",
            name: i.name,
          };
        },
        update: async (_id, c) => ({
          id: "l1",
          name: "Lead",
          status: c.status,
        }),
      },
      clients: {
        list: async () => [],
      },
      projects: {
        list: async () => [],
        create: async (i) => ({
          id: "p1",
          name: i.name,
        }),
      },
      invoices: {
        list: async () => [],
      },
      tickets: {
        list: async () => [],
        create: async (i) => ({
          id: "t1",
          subject: i.subject,
        }),
      },
    });

    const map = byName(tools);
    // Reads
    for (const name of [
      "crm.leads.list",
      "clients.list",
      "projects.list",
      "metrics.summary",
      "crm.pipeline.summary",
      "revenue.summary",
      "tickets.list",
    ]) {
      expect(
        map.get(name)?.mode,
      ).toBe("read");
    }
    // Writes (require confirmation)
    for (const name of [
      "crm.leads.create",
      "crm.leads.update_stage",
      "projects.create",
      "tickets.create",
    ]) {
      expect(
        map.get(name)?.mode,
      ).toBe("write");
    }
  });

  it("summarizes the pipeline by stage with total value", async () => {
    const tools = buildDefaultAiTools({
      leads: {
        list: async () => [
          {
            status: "new",
            estimatedValue: 1000,
          },
          {
            status: "won",
            estimatedValue: 5000,
          },
          {
            status: "new",
            estimatedValue: 500,
          },
        ],
        create: async () => ({
          id: "x",
          name: "x",
        }),
      },
    });

    const tool = byName(tools).get(
      "crm.pipeline.summary",
    )!;
    const result = await tool.run(
      {},
      CTX,
    );

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      byStage: { new: 2, won: 1 },
      estimatedValue: 6500,
    });
  });

  it("summarizes revenue as paid vs outstanding", async () => {
    const tools = buildDefaultAiTools({
      invoices: {
        list: async () => [
          {
            status: "paid",
            amount: 300,
          },
          {
            status: "sent",
            amount: 200,
          },
          {
            status: "draft",
            amount: 50,
          },
        ],
      },
    });

    const tool = byName(tools).get(
      "revenue.summary",
    )!;
    const result = await tool.run(
      {},
      CTX,
    );

    expect(result.data).toMatchObject({
      paid: 300,
      outstanding: 250,
    });
  });

  it("update_stage passes the new status through to the service", async () => {
    let moved = "";
    const tools = buildDefaultAiTools({
      leads: {
        list: async () => [],
        create: async () => ({
          id: "x",
          name: "x",
        }),
        update: async (_id, c) => {
          moved = c.status ?? "";

          return {
            id: "l1",
            name: "Ann",
            status: c.status,
          };
        },
      },
    });

    const tool = byName(tools).get(
      "crm.leads.update_stage",
    )!;
    const result = await tool.run(
      { leadId: "l1", status: "won" },
      CTX,
    );

    expect(moved).toBe("won");
    expect(result.summary).toContain(
      "won",
    );
  });
});
