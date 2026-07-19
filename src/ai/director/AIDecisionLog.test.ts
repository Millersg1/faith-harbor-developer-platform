import { describe, expect, it } from "vitest";

import { AIDecisionLog } from "./AIDecisionLog";

describe("AIDecisionLog", () => {
  it("records decisions", () => {
    const log = new AIDecisionLog();

    log.record({
      id: "1",
      timestamp: "2026-01-01",
      capability: "writing",
      providerId: "ollama",
      providerName: "Ollama",
      reason: "Highest score",
      confidence: 96,
      model: "hermes3:latest",
    });

    expect(log.size).toBe(1);
  });

  it("returns the latest decisions", () => {
    const log = new AIDecisionLog();

    for (let i = 0; i < 10; i++) {
      log.record({
        id: `${i}`,
        timestamp: "2026",
        capability: "writing",
        providerId: "ollama",
        providerName: "Ollama",
        reason: "Highest score",
        confidence: 90,
        model: "hermes3:latest",
      });
    }

    expect(log.latest(5)).toHaveLength(5);
    expect(log.latest(5)[0].id).toBe("9");
  });

  it("clears the log", () => {
    const log = new AIDecisionLog();

    log.record({
      id: "1",
      timestamp: "2026",
      capability: "writing",
      providerId: "ollama",
      providerName: "Ollama",
      reason: "Highest score",
      confidence: 95,
      model: "hermes3:latest",
    });

    log.clear();

    expect(log.size).toBe(0);
  });
});