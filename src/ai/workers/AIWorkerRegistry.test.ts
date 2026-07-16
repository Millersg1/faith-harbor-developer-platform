import {
  describe,
  expect,
  it,
} from "vitest";

import type { AIWorker } from "./AIWorker";
import { AIWorkerRegistry } from "./AIWorkerRegistry";

function createWorker(
  id: string,
): AIWorker {
  return {
    id,
    name: id,
    description:
      `Worker ${id}`,
    capabilities: [
      "writing",
    ],
    systemPrompt:
      "Complete the assigned work carefully.",
    preferredProvider: "auto",
    requiresApproval: true,
    allowedTools: [],
  };
}

describe("AIWorkerRegistry", () => {
  it("registers an AI worker", () => {
    const registry =
      new AIWorkerRegistry();

    const worker =
      createWorker(
        "proposal-writer",
      );

    registry.register(worker);

    expect(
      registry.has(
        "proposal-writer",
      ),
    ).toBe(true);

    expect(registry.size).toBe(1);
  });

  it("returns a registered worker", () => {
    const registry =
      new AIWorkerRegistry();

    const worker =
      createWorker(
        "research-assistant",
      );

    registry.register(worker);

    expect(
      registry.get(
        "research-assistant",
      ),
    ).toBe(worker);
  });

  it("returns all registered workers", () => {
    const registry =
      new AIWorkerRegistry();

    const first =
      createWorker("first");

    const second =
      createWorker("second");

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toEqual([
      first,
      second,
    ]);
  });

  it("rejects duplicate worker identifiers", () => {
    const registry =
      new AIWorkerRegistry();

    registry.register(
      createWorker(
        "proposal-writer",
      ),
    );

    expect(() =>
      registry.register(
        createWorker(
          "proposal-writer",
        ),
      ),
    ).toThrow(
      'AI worker "proposal-writer" is already registered.',
    );
  });

  it("throws when a worker is missing", () => {
    const registry =
      new AIWorkerRegistry();

    expect(() =>
      registry.get("missing"),
    ).toThrow(
      'AI worker "missing" was not found.',
    );
  });

  it("unregisters an AI worker", () => {
    const registry =
      new AIWorkerRegistry();

    registry.register(
      createWorker(
        "book-editor",
      ),
    );

    expect(
      registry.unregister(
        "book-editor",
      ),
    ).toBe(true);

    expect(
      registry.has(
        "book-editor",
      ),
    ).toBe(false);
  });

  it("returns false when unregistering a missing worker", () => {
    const registry =
      new AIWorkerRegistry();

    expect(
      registry.unregister(
        "missing",
      ),
    ).toBe(false);
  });
});