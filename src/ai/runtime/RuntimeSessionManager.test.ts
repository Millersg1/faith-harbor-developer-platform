import {
  describe,
  expect,
  it,
} from "vitest";

import { RuntimeSessionManager } from "./RuntimeSessionManager";

describe("RuntimeSessionManager", () => {
  it("creates a runtime session", () => {
    const manager =
      new RuntimeSessionManager();

    const session = manager.create({
      name: "Proposal Writer",
      capability: "writing",
      provider: "auto",
      model: "hermes3:latest",
      metadata: {
        clientName: "Faith Harbor LLC",
      },
    });

    expect(session.id).toBeDefined();
    expect(session.name).toBe(
      "Proposal Writer",
    );
    expect(session.capability).toBe(
      "writing",
    );
    expect(session.provider).toBe(
      "auto",
    );
    expect(session.model).toBe(
      "hermes3:latest",
    );
    expect(
      session.metadata?.clientName,
    ).toBe("Faith Harbor LLC");
    expect(manager.size).toBe(1);
  });

  it("returns a runtime session", () => {
    const manager =
      new RuntimeSessionManager();

    const session = manager.create({
      name: "Research Session",
      capability: "research",
    });

    expect(
      manager.get(session.id),
    ).toBe(session);
  });

  it("throws when a runtime session is missing", () => {
    const manager =
      new RuntimeSessionManager();

    expect(() =>
      manager.get("missing"),
    ).toThrow(
      'Runtime session "missing" was not found.',
    );
  });

  it("lists runtime sessions", () => {
    const manager =
      new RuntimeSessionManager();

    const first = manager.create({
      name: "First Session",
      capability: "writing",
    });

    const second = manager.create({
      name: "Second Session",
      capability: "research",
    });

    expect(manager.list()).toEqual([
      first,
      second,
    ]);
  });

  it("adds messages to a runtime session", () => {
    const manager =
      new RuntimeSessionManager();

    const session = manager.create({
      name: "Conversation",
      capability: "writing",
    });

    const message =
      manager.addMessage(
        session.id,
        {
          role: "user",
          content:
            "  Draft a client proposal.  ",
        },
      );

    expect(message.sessionId).toBe(
      session.id,
    );
    expect(message.role).toBe("user");
    expect(message.content).toBe(
      "Draft a client proposal.",
    );

    expect(
      manager.getMessages(
        session.id,
      ),
    ).toEqual([message]);
  });

  it("stores assistant message provider and model", () => {
    const manager =
      new RuntimeSessionManager();

    const session = manager.create({
      name: "AI Conversation",
      capability: "writing",
    });

    const message =
      manager.addMessage(
        session.id,
        {
          role: "assistant",
          content:
            "Here is the proposal.",
          provider: "ollama",
          model: "hermes3:latest",
        },
      );

    expect(message.provider).toBe(
      "ollama",
    );
    expect(message.model).toBe(
      "hermes3:latest",
    );
  });

  it("rejects an empty runtime message", () => {
    const manager =
      new RuntimeSessionManager();

    const session = manager.create({
      name: "Conversation",
      capability: "writing",
    });

    expect(() =>
      manager.addMessage(
        session.id,
        {
          role: "user",
          content: "   ",
        },
      ),
    ).toThrow(
      "Runtime message content cannot be empty.",
    );
  });

  it("deletes a session and its messages", () => {
    const manager =
      new RuntimeSessionManager();

    const session = manager.create({
      name: "Temporary Session",
      capability: "writing",
    });

    manager.addMessage(
      session.id,
      {
        role: "user",
        content: "Hello",
      },
    );

    expect(
      manager.delete(session.id),
    ).toBe(true);
    expect(manager.size).toBe(0);

    expect(() =>
      manager.getMessages(
        session.id,
      ),
    ).toThrow(
      `Runtime session "${session.id}" was not found.`,
    );
  });

  it("returns false when deleting a missing session", () => {
    const manager =
      new RuntimeSessionManager();

    expect(
      manager.delete("missing"),
    ).toBe(false);
  });
});