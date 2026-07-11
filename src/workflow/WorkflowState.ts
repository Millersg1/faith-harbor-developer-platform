export const workflowStates = [
  "draft",
  "ready",
  "running",
  "waiting_for_approval",
  "approved",
  "rejected",
  "completed",
  "failed",
  "cancelled",
  "archived",
] as const;

export type WorkflowState = (typeof workflowStates)[number];
