import { randomUUID } from "node:crypto";
import type { WorkflowAuditEvent } from "./WorkflowTypes";
import type { WorkflowState } from "./WorkflowState";

export class WorkflowAudit {
  private readonly events: WorkflowAuditEvent[] = [];

  record(input: {
    workflowId: string;
    action: string;
    actor: string;
    fromState?: WorkflowState;
    toState?: WorkflowState;
    details?: Record<string, unknown>;
  }): WorkflowAuditEvent {
    const event: WorkflowAuditEvent = {
      id: randomUUID(),
      workflowId: input.workflowId,
      action: input.action,
      actor: input.actor,
      fromState: input.fromState,
      toState: input.toState,
      timestamp: new Date().toISOString(),
      details: input.details,
    };

    this.events.push(event);
    return event;
  }

  list(workflowId: string): WorkflowAuditEvent[] {
    return this.events.filter((event) => event.workflowId === workflowId);
  }
}
