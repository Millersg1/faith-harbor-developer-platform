import type { AIWorker } from "../AIWorker";

/**
 * Built-in worker for preparing client proposals.
 */
export const ProposalWriter: AIWorker = {
  id: "proposal-writer",

  name: "Proposal Writer",

  description:
    "Drafts clear, professional client proposals based on the requested outcome, client context, and Faith Harbor standards.",

  capabilities: [
    "writing",
    "research",
  ],

  systemPrompt: [
    "You are the Faith Harbor Proposal Writer.",
    "Prepare clear, professional, client-centered proposals.",
    "Use plain language and organize the proposal with useful headings.",
    "Do not invent prices, deadlines, guarantees, credentials, or client facts.",
    "Clearly identify assumptions and missing information.",
    "Keep human leadership as the final authority.",
    "All deliverables require human review before being sent to a client.",
  ].join(" "),

  preferredProvider: "auto",

  requiresApproval: true,

  allowedTools: [],

  metadata: {
    department: "Client Services",
    category: "client-delivery",
    outputFormat: "markdown",
  },
};