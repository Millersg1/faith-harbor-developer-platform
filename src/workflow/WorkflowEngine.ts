import type { ClientWorkRequest } from "./ClientWorkRequest";
import { ClientWorkRequestFactory } from "./ClientWorkRequestFactory";
import type { WorkflowState } from "./WorkflowState";
import type {
  WorkflowDefinition,
  WorkflowRecord,
} from "./WorkflowTypes";
import { WorkflowAudit } from "./WorkflowAudit";
import { WorkflowRegistry } from "./WorkflowRegistry";

const allowedTransitions: Record<
  WorkflowState,
  WorkflowState[]
> = {
  draft: ["ready", "cancelled"],
  ready: ["running", "cancelled"],
  running: [
    "waiting_for_approval",
    "completed",
    "failed",
    "cancelled",
  ],
  waiting_for_approval: [
    "approved",
    "rejected",
    "cancelled",
  ],
  approved: [
    "completed",
    "failed",
    "cancelled",
  ],
  rejected: ["archived"],
  completed: ["archived"],
  failed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export class WorkflowEngine {
  private readonly clientRequestFactory =
    new ClientWorkRequestFactory();

  constructor(
    private readonly registry =
      new WorkflowRegistry(),
    private readonly audit =
      new WorkflowAudit(),
  ) {}

  create(
    definition: WorkflowDefinition,
    actor = "system",
  ): WorkflowRecord {
    const now = new Date().toISOString();

    const workflow: WorkflowRecord = {
      ...definition,
      state: "draft",
      createdAt: now,
      updatedAt: now,
      metadata:
        definition.metadata ?? {},
    };

    this.registry.create(workflow);

    this.audit.record({
      workflowId: workflow.id,
      action: "workflow.created",
      actor,
      toState: "draft",
    });

    return workflow;
  }

  /**
   * Creates a workflow from a client work request.
   */
  createClientRequest(
    request: ClientWorkRequest,
    actor = "system",
  ): WorkflowRecord {
    return this.create(
      this.clientRequestFactory.create(
        request,
      ),
      actor,
    );
  }

  list(): WorkflowRecord[] {
    return this.registry.list();
  }

  get(id: string): WorkflowRecord {
    const workflow =
      this.registry.get(id);

    if (!workflow) {
      throw new Error(
        `Workflow '${id}' was not found.`,
      );
    }

    return workflow;
  }

  transition(
    id: string,
    toState: WorkflowState,
    actor: string,
  ): WorkflowRecord {
    const workflow = this.get(id);

    if (
      !allowedTransitions[
        workflow.state
      ].includes(toState)
    ) {
      throw new Error(
        `Invalid workflow transition from '${workflow.state}' to '${toState}'.`,
      );
    }

    const fromState =
      workflow.state;

    const updated: WorkflowRecord = {
      ...workflow,
      state: toState,
      updatedAt:
        new Date().toISOString(),
    };

    this.registry.update(updated);

    this.audit.record({
      workflowId: id,
      action:
        "workflow.transitioned",
      actor,
      fromState,
      toState,
    });

    return updated;
  }

  submit(
    id: string,
    actor: string,
  ): WorkflowRecord {
    return this.transition(
      id,
      "ready",
      actor,
    );
  }

  start(
    id: string,
    actor: string,
  ): WorkflowRecord {
    const workflow =
      this.transition(
        id,
        "running",
        actor,
      );

    if (
      workflow.requiresApproval
    ) {
      return this.transition(
        id,
        "waiting_for_approval",
        actor,
      );
    }

    return workflow;
  }

  approve(
    id: string,
    actor: string,
  ): WorkflowRecord {
    return this.transition(
      id,
      "approved",
      actor,
    );
  }

  reject(
    id: string,
    actor: string,
  ): WorkflowRecord {
    return this.transition(
      id,
      "rejected",
      actor,
    );
  }

  complete(
    id: string,
    actor: string,
  ): WorkflowRecord {
    return this.transition(
      id,
      "completed",
      actor,
    );
  }

  history(id: string) {
    this.get(id);

    return this.audit.list(id);
  }
}
