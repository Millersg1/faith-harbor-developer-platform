import type { Department } from "./Department";

const checkedAt = new Date().toISOString();

/**
 * Seeds the twelve Faith Harbor LLC departments recognized by the
 * governing Constitution. Departments with a built workspace report
 * "healthy"; departments that are registered but not yet operational
 * report "unknown" until their workspace comes online.
 */
export const defaultDepartments: Department[] = [
  {
    id: "client-services",
    name: "Client Services",
    description:
      "Manages client relationships, proposals, projects, and service delivery.",
    mission:
      "Serve clients with excellence, clarity, and integrity.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT", "Claude"],
    plugins: [],
    permissions: [],
    successMetrics: ["Proposals delivered", "Active projects"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "artificial-intelligence",
    name: "Artificial Intelligence",
    description:
      "Coordinates governed AI providers, prompts, conversations, and AI-assisted work.",
    mission:
      "Apply AI as a governed tool under human authority.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT", "Claude", "Ollama", "OpenRouter"],
    plugins: [],
    permissions: [],
    successMetrics: ["Explainable decisions", "Human-approved output"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "analytics",
    name: "Analytics",
    description:
      "Reviews operational reporting, business activity, and performance information.",
    mission:
      "Turn operational data into clear, honest insight.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT"],
    plugins: [],
    permissions: [],
    successMetrics: ["Accurate reporting"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "administration",
    name: "Administration",
    description:
      "Manages Faith Harbor OS preferences, providers, system information, and configuration.",
    mission:
      "Keep the platform configured, secure, and well governed.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT"],
    plugins: [],
    permissions: [],
    successMetrics: ["Stable configuration"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
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
      status: "unknown",
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
      status: "unknown",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "publishing",
    name: "Publishing",
    description:
      "Manages manuscripts, editing stages, book production, distribution, and royalties.",
    mission: "Bring worthy books into the world with excellence.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT", "Claude"],
    plugins: [],
    permissions: [],
    successMetrics: ["Manuscripts published"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "hosting",
    name: "Hosting",
    description:
      "Monitors websites, domains, SSL certificates, hosting accounts, alerts, and maintenance.",
    mission: "Keep client sites fast, secure, and online.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT"],
    plugins: [],
    permissions: [],
    successMetrics: ["Uptime", "Resolved alerts"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "marketing",
    name: "Marketing",
    description:
      "Coordinates content, social media, email campaigns, SEO, funnels, and lead generation.",
    mission: "Tell Faith Harbor's story with honesty and clarity.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT", "Claude"],
    plugins: [],
    permissions: [],
    successMetrics: ["Qualified leads"],
    health: {
      status: "unknown",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "sales",
    name: "Sales",
    description:
      "Manages opportunities, leads, consultations, follow-up, and new business development.",
    mission: "Match clients to the right services with integrity.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT"],
    plugins: [],
    permissions: [],
    successMetrics: ["Closed opportunities"],
    health: {
      status: "unknown",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "support",
    name: "Support",
    description:
      "Tracks support requests, service issues, client communication, and resolutions.",
    mission: "Respond quickly and care for every client need.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT"],
    plugins: [],
    permissions: [],
    successMetrics: ["Resolved requests"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
  {
    id: "accounting",
    name: "Accounting",
    description:
      "Manages invoices, expenses, payments, revenue, financial records, and summaries.",
    mission: "Steward Faith Harbor's finances faithfully.",
    owner: "Director",
    workflows: [],
    aiProviders: ["ChatGPT"],
    plugins: [],
    permissions: [],
    successMetrics: ["Accurate financial records"],
    health: {
      status: "healthy",
      activeWorkflows: 0,
      pendingApprovals: 0,
      lastCheckedAt: checkedAt,
    },
  },
];
