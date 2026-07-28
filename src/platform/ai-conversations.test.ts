import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import { AiConversationService } from "./ai/conversations/AiConversationService";
import { AiConversationRepository } from "./ai/conversations/AiConversationRepository";

function service(): AiConversationService {
  return new AiConversationService(
    new AiConversationRepository(),
  );
}

describe("AiConversationService", () => {
  it("creates a conversation from the first message and lists it", async () => {
    const svc = service();

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const id =
          await svc.recordMessage("u1", {
            role: "user",
            content:
              "How many leads do we have this quarter?",
          });
        await svc.recordMessage("u1", {
          conversationId: id,
          role: "assistant",
          content: "You have 12.",
        });

        const list =
          await svc.list("u1");
        expect(list).toHaveLength(1);
        // Title is derived from the first user message.
        expect(list[0].title).toContain(
          "How many leads",
        );

        const msgs =
          await svc.messages(id, "u1");
        expect(
          msgs.map((m) => m.role),
        ).toEqual(["user", "assistant"]);
        expect(msgs[1].content).toBe(
          "You have 12.",
        );
      },
    );
  });

  it("keeps conversations private to their creator", async () => {
    const svc = service();

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const id =
          await svc.recordMessage("u1", {
            role: "user",
            content: "A private question.",
          });

        // A different user in the SAME org sees nothing and cannot read it.
        expect(
          await svc.list("u2"),
        ).toHaveLength(0);
        expect(
          await svc.get(id, "u2"),
        ).toBeUndefined();
        expect(
          await svc.messages(id, "u2"),
        ).toHaveLength(0);
        expect(
          await svc.rename(
            id,
            "u2",
            "hijacked",
          ),
        ).toBe(false);
      },
    );
  });

  it("isolates conversations per tenant", async () => {
    const svc = service();

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.recordMessage("u1", {
          role: "user",
          content: "Org A secret.",
        });
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        // Same user id, different tenant → no cross-tenant visibility.
        expect(
          await svc.list("u1"),
        ).toHaveLength(0);
      },
    );
  });

  it("starts a fresh conversation when given an id the user does not own", async () => {
    const svc = service();

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const owned =
          await svc.recordMessage("u1", {
            role: "user",
            content: "Mine.",
          });

        // u2 references u1's conversation id — it must NOT attach to it.
        const created =
          await svc.recordMessage("u2", {
            conversationId: owned,
            role: "user",
            content: "Not yours.",
          });

        expect(created).not.toBe(owned);
        // u1's conversation still has only the one message.
        expect(
          await svc.messages(
            owned,
            "u1",
          ),
        ).toHaveLength(1);
      },
    );
  });
});
