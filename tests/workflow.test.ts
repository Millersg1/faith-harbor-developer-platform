import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "../src/workflow";

describe("Workflow Engine", () => {
  it("creates and lists a workflow", () => {
    const engine = new WorkflowEngine();

    const workflow = engine.create({
      id: "client-onboarding",
      name: "Client Onboarding",
      department: "Client Services",
      owner: "Shawn",
      requiresApproval: false,
      steps: [],
    });

    expect(workflow.state).toBe("draft");
    expect(engine.list()).toHaveLength(1);
  });

  it("runs a workflow without approval", () => {
    const engine = new WorkflowEngine();
    engine.create({
      id: "health-check",
      name: "Health Check",
      department: "Engineering",
      owner: "System",
      requiresApproval: false,
      steps: [],
    });

    engine.submit("health-check", "Shawn");
    const running = engine.start("health-check", "Shawn");

    expect(running.state).toBe("running");
    expect(engine.complete("health-check", "Shawn").state).toBe("completed");
  });

  it("waits for approval when required", () => {
    const engine = new WorkflowEngine();
    engine.create({
      id: "publish-book",
      name: "Publish Book",
      department: "Publishing",
      owner: "Shawn",
      requiresApproval: true,
      steps: [],
    });

    engine.submit("publish-book", "Shawn");
    const waiting = engine.start("publish-book", "OpenClaw");

    expect(waiting.state).toBe("waiting_for_approval");
    expect(engine.approve("publish-book", "Shawn").state).toBe("approved");
    expect(engine.complete("publish-book", "Shawn").state).toBe("completed");
  });

  it("records audit history", () => {
    const engine = new WorkflowEngine();
    engine.create({
      id: "audit-test",
      name: "Audit Test",
      department: "Administration",
      owner: "System",
      requiresApproval: false,
      steps: [],
    });

    engine.submit("audit-test", "Shawn");

    const history = engine.history("audit-test");
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].action).toBe("workflow.created");
  });

  it("rejects invalid transitions", () => {
    const engine = new WorkflowEngine();
    engine.create({
      id: "invalid-transition",
      name: "Invalid Transition",
      department: "Engineering",
      owner: "System",
      requiresApproval: false,
      steps: [],
    });

    expect(() => engine.complete("invalid-transition", "System")).toThrow(
      "Invalid workflow transition",
    );
  });
});
