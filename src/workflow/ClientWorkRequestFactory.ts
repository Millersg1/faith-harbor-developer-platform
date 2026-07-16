import type { WorkflowDefinition } from "./WorkflowTypes";
import type { ClientWorkRequest } from "./ClientWorkRequest";

/**
 * Converts client work requests into executable workflows.
 */
export class ClientWorkRequestFactory {
  /**
   * Creates a workflow definition from a client request.
   */
  create(
    request: ClientWorkRequest,
  ): WorkflowDefinition {
    return {
      id: request.id,
      name: request.requestedOutcome,
      department: request.department,
      owner: request.owner,
      requiresApproval:
        request.requiresApproval,
      steps: [],
      metadata: {
        clientName:
          request.clientName,
        dueDate: request.dueDate,
        ...request.metadata,
      },
    };
  }
}