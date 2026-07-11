import type { Department } from "./Department";

const checkedAt = new Date().toISOString();

export const defaultDepartments: Department[] = [
  {
    id: "engineering",
    name: "Engineering",
    description: "Builds and maintains Faith Harbor software systems.",
    mission: "Deliver secure, reliable, and maintainable technology.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT", "Claude", "Codex"],
    plugins: [],
    permissions: [],
    successMetrics: ["Green builds", "Passing tests"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "ministry",
    name: "Ministry",
    description: "Supports Faith Harbor ministry programs and resources.",
    mission: "Serve people with biblical truth, compassion, and excellence.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT", "Claude"],
    plugins: [],
    permissions: [],
    successMetrics: ["Approved ministry resources"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
];