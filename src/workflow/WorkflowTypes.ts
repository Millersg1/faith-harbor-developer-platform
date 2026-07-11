import type { DepartmentName } from "../domain/departments";
import type { WorkflowState } from "./WorkflowState";

export interface WorkflowStep {
  id: string;
  name: string;
  completed: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  department: DepartmentName;
  owner: string;
  requiresApproval: boolean;
  steps: WorkflowStep[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowRecord extends WorkflowDefinition {
  state: WorkflowState;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAuditEvent {
  id: string;
  workflowId: string;
  action: string;
  fromState?: WorkflowState;
  toState?: WorkflowState;
  actor: string;
  timestamp: string;
  details?: Record<string, unknown>;
}
