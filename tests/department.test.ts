import { describe, expect, it } from "vitest";
import { DepartmentRegistry } from "../src/departments/DepartmentRegistry";
import { DepartmentService } from "../src/departments/DepartmentService";
import type { Department } from "../src/departments/Department";
const engineering: Department = {
  id: "engineering",
  name: "Engineering",
  description: "Builds and maintains Faith Harbor OS.",
  mission: "Deliver reliable software.",
  owner: "Director",
  workflows: [],
  aiProviders: ["ChatGPT"],
  plugins: [],
  permissions: [],
  successMetrics: ["Green builds"],
  health: {
    status: "healthy",
    activeWorkflows: 0,
    pendingApprovals: 0,
    lastCheckedAt: new Date().toISOString(),
  },
};
describe("Department Registry", () => {
  it("registers a department", () => {
    const registry = new DepartmentRegistry();

    registry.register(engineering);

    expect(registry.count()).toBe(1);
    expect(registry.exists("engineering")).toBe(true);
  });
});