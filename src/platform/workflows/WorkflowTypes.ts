/**
 * Tenant-configurable automation: when a trigger event fires, run an ordered
 * list of steps (each after an optional delay) that perform actions through
 * existing services. Triggers come from the activity-event spine; scheduled
 * steps are advanced by a background tick worker (same pattern as drip).
 *
 * v1 is deliberately a safe, closed set of actions — no arbitrary
 * tenant-supplied code execution.
 */

/** A trigger is an activity-event type, e.g. "lead.created", "invoice.paid". */
export type WorkflowTrigger = string;

export type WorkflowActionType =
  | "notify" // in-app notification to owners/admins
  | "email" // send an email (to an explicit address or the event's contact)
  | "enroll_sequence" // enroll the event's contact into a drip sequence
  | "note"; // record an activity note on the subject

export const WORKFLOW_ACTION_TYPES: readonly WorkflowActionType[] =
  ["notify", "email", "enroll_sequence", "note"];

export interface WorkflowStep {
  id: string;
  type: WorkflowActionType;
  /** Hours to wait before this step runs (from the previous step/trigger). */
  delayHours: number;
  /** Action-specific settings (never secrets, never code). */
  config: Record<string, unknown>;
}

export type WorkflowStatus =
  | "active"
  | "paused";

export interface WorkflowRecord {
  id: string;
  organizationId: string;
  name: string;
  trigger: WorkflowTrigger;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export type WorkflowRunStatus =
  | "running"
  | "completed"
  | "failed";

export interface WorkflowRunLogEntry {
  stepIndex: number;
  action: string;
  at: string;
  result: string;
}

export interface WorkflowRunRecord {
  id: string;
  organizationId: string;
  workflowId: string;
  triggerType: string;

  /** The record that triggered the run, for context/notes. */
  subjectType?: string;
  subjectId?: string;

  /** Recipient context captured from the trigger event (for email/enroll). */
  contextEmail?: string;
  contextName?: string;

  /** Index of the NEXT step to run. */
  stepIndex: number;
  status: WorkflowRunStatus;
  /** ISO timestamp the next step is due. */
  nextRunAt: string;
  log: WorkflowRunLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRequest {
  name: string;
  trigger: string;
  steps?: WorkflowStep[];
}

/** A due run paired with its tenant, for the cross-tenant worker scan. */
export interface DueRunRef {
  id: string;
  organizationId: string;
}
