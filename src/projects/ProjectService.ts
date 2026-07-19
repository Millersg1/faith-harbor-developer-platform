import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";
import type { ClientRecord } from "../clients/ClientTypes";

import type { ProjectRecord } from "./ProjectRecord";
import { ProjectRepository } from "./ProjectRepository";
import type { ProjectRequest } from "./ProjectRequest";

/**
 * The proposal details needed to start a project.
 */
export interface ProposalToProject {
  proposalId: string;
  clientId: string;
  service?: string;
  requestedOutcome?: string;
  name?: string;
}

/**
 * Notified after a project is created, with the owning client.
 *
 * The automation engine uses this to prepare an onboarding-email
 * draft. It is optional so the projects module has no hard dependency
 * on automation, and failures here never block project creation.
 */
export type ProjectCreatedHook = (
  project: ProjectRecord,
  client: ClientRecord,
) => void;

/**
 * Creates and manages client projects.
 */
export class ProjectService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new ProjectRepository(),
    private readonly onProjectCreated?: ProjectCreatedHook,
  ) {}

  /**
   * Creates and stores a new project.
   */
  create(
    request: ProjectRequest,
  ): ProjectRecord {
    // Ensure the client exists.
    const client =
      this.clients.get(
        request.clientId,
      );

    const now =
      new Date().toISOString();

    const project: ProjectRecord = {
      id: randomUUID(),

      clientId: request.clientId,

      proposalId:
        request.proposalId,

      name: request.name.trim(),

      description:
        request.description,

      status:
        request.status ??
        "planned",

      startDate:
        request.startDate,

      dueDate:
        request.dueDate,

      completedDate:
        request.completedDate,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    const created =
      this.repository.create(
        project,
      );

    // Best-effort: notify the automation engine. A drafting failure
    // must never prevent the project itself from being saved.
    if (this.onProjectCreated) {
      try {
        this.onProjectCreated(
          created,
          client,
        );
      } catch {
        // Intentionally ignored; the project is already stored.
      }
    }

    return created;
  }

  /**
   * Starts a project from an accepted proposal, linking the two.
   *
   * This connects Client Services (proposals) to delivery
   * (projects) so accepted work flows straight into execution.
   */
  createFromProposal(
    input: ProposalToProject,
  ): ProjectRecord {
    const name =
      input.name?.trim() ||
      input.requestedOutcome?.trim() ||
      input.service?.trim() ||
      "New Project";

    const description =
      input.service
        ? `Project created from the ${input.service.trim()} proposal.`
        : "Project created from a proposal.";

    return this.create({
      clientId: input.clientId,

      proposalId:
        input.proposalId,

      name,

      description,

      status: "planned",

      metadata: {
        fromProposalId:
          input.proposalId,
      },
    });
  }

  /**
   * Returns every project.
   */
  list(): readonly ProjectRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one project.
   */
  get(
    projectId: string,
  ): ProjectRecord {
    return this.repository.get(
      projectId,
    );
  }

  /**
   * Returns all projects for one client.
   */
  listForClient(
    clientId: string,
  ): readonly ProjectRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing project.
   */
  update(
    project: ProjectRecord,
  ): ProjectRecord {
    this.clients.get(project.clientId);

    return this.repository.update({
      ...project,
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a project.
   */
  delete(
    projectId: string,
  ): void {
    this.repository.delete(
      projectId,
    );
  }
}