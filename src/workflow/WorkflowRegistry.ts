import type { WorkflowRecord } from "./WorkflowTypes";

export class WorkflowRegistry {
  private readonly workflows = new Map<string, WorkflowRecord>();

  create(workflow: WorkflowRecord): WorkflowRecord {
    if (this.workflows.has(workflow.id)) {
      throw new Error(`Workflow '${workflow.id}' already exists.`);
    }

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  get(id: string): WorkflowRecord | undefined {
    return this.workflows.get(id);
  }

  list(): WorkflowRecord[] {
    return Array.from(this.workflows.values());
  }

  update(workflow: WorkflowRecord): WorkflowRecord {
    if (!this.workflows.has(workflow.id)) {
      throw new Error(`Workflow '${workflow.id}' was not found.`);
    }

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }
}
