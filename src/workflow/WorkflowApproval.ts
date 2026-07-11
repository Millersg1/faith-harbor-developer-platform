import type { WorkflowRecord } from "./WorkflowTypes";

export function approvalRequired(workflow: WorkflowRecord): boolean {
  return workflow.requiresApproval;
}
