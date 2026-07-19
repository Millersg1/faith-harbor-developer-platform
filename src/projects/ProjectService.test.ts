import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import type { ProjectRecord } from "./ProjectRecord";
import { ProjectRepository } from "./ProjectRepository";
import { ProjectService } from "./ProjectService";

function createProjectService() {
  const clients =
    new ClientService();

  const repository =
    new ProjectRepository();

  const service =
    new ProjectService(
      clients,
      repository,
    );

  return {
    service,
    clients,
    repository,
  };
}

function createClient(
  clients: ClientService,
  companyName =
    "Acme Manufacturing",
) {
  return clients.create({
    companyName,

    primaryContact:
      "Jordan Smith",
  });
}

describe("ProjectService", () => {
  it("creates and saves a project", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "Managed IT Implementation",

        description:
          "Implement managed IT services.",

        startDate:
          "2026-07-20",

        dueDate:
          "2026-08-20",

        notes:
          "Begin with infrastructure review.",

        metadata: {
          priority: "high",
        },
      });

    expect(project.id)
      .toBeDefined();

    expect(project.clientId)
      .toBe(client.id);

    expect(project.name)
      .toBe(
        "Managed IT Implementation",
      );

    expect(project.description)
      .toBe(
        "Implement managed IT services.",
      );

    expect(project.status)
      .toBe("planned");

    expect(project.startDate)
      .toBe("2026-07-20");

    expect(project.dueDate)
      .toBe("2026-08-20");

    expect(project.notes)
      .toBe(
        "Begin with infrastructure review.",
      );

    expect(project.metadata)
      .toEqual({
        priority: "high",
      });

    expect(project.createdAt)
      .toBeDefined();

    expect(project.updatedAt)
      .toBeDefined();

    expect(service.list())
      .toEqual([project]);

    expect(
      service.get(project.id),
    ).toBe(project);
  });

  it("uses planned as the default project status", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "Default Status Project",
      });

    expect(project.status)
      .toBe("planned");
  });

  it("uses a requested project status", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "Active Project",

        status: "active",
      });

    expect(project.status)
      .toBe("active");
  });

  it("trims the project name", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "  Website Redesign  ",
      });

    expect(project.name)
      .toBe(
        "Website Redesign",
      );
  });

  it("creates a project linked to a proposal", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        proposalId:
          "proposal-1",

        name:
          "Proposal Project",
      });

    expect(project.proposalId)
      .toBe("proposal-1");
  });

  it("copies project metadata", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const metadata = {
      priority: "high",
      department: "technology",
    };

    const project =
      service.create({
        clientId: client.id,

        name:
          "Metadata Project",

        metadata,
      });

    metadata.priority =
      "low";

    expect(project.metadata)
      .toEqual({
        priority: "high",
        department:
          "technology",
      });
  });

  it("lists all projects", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const firstClient =
      createClient(
        clients,
        "Acme Manufacturing",
      );

    const secondClient =
      createClient(
        clients,
        "Faith Harbor LLC",
      );

    const firstProject =
      service.create({
        clientId:
          firstClient.id,

        name:
          "First Project",
      });

    const secondProject =
      service.create({
        clientId:
          secondClient.id,

        name:
          "Second Project",
      });

    expect(service.list())
      .toEqual([
        firstProject,
        secondProject,
      ]);
  });

  it("lists projects for one client", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const firstClient =
      createClient(
        clients,
        "Acme Manufacturing",
      );

    const secondClient =
      createClient(
        clients,
        "Another Company",
      );

    const firstProject =
      service.create({
        clientId:
          firstClient.id,

        name:
          "First Client Project",
      });

    const secondProject =
      service.create({
        clientId:
          secondClient.id,

        name:
          "Second Client Project",
      });

    const thirdProject =
      service.create({
        clientId:
          firstClient.id,

        name:
          "Another First Client Project",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstProject,
      thirdProject,
    ]);

    expect(
      service.listForClient(
        secondClient.id,
      ),
    ).toEqual([
      secondProject,
    ]);
  });

  it("updates an existing project", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "Original Project",

        status: "planned",
      });

    const updateRequest:
      ProjectRecord = {
        ...project,

        name:
          "Updated Project",

        status: "active",

        notes:
          "Work has started.",

        updatedAt:
          "2000-01-01T00:00:00.000Z",
      };

    const updated =
      service.update(
        updateRequest,
      );

    expect(updated.id)
      .toBe(project.id);

    expect(updated.name)
      .toBe(
        "Updated Project",
      );

    expect(updated.status)
      .toBe("active");

    expect(updated.notes)
      .toBe(
        "Work has started.",
      );

    expect(updated.createdAt)
      .toBe(project.createdAt);

    expect(updated.updatedAt)
      .not.toBe(
        "2000-01-01T00:00:00.000Z",
      );

    expect(
      service.get(project.id),
    ).toEqual(updated);
  });

  it("deletes a project", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "Project To Delete",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(
      project.id,
    );

    expect(service.list())
      .toHaveLength(0);

    expect(() =>
      service.get(project.id),
    ).toThrow(
      `Project "${project.id}" was not found.`,
    );
  });

  it("rejects a project for a missing client", () => {
    const {
      service,
    } = createProjectService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",

        name:
          "Invalid Project",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });

  it("creates a project from a proposal", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.createFromProposal({
        proposalId:
          "proposal-42",
        clientId: client.id,
        service:
          "Managed IT Services",
        requestedOutcome:
          "Prepare a managed IT services proposal",
      });

    expect(project.clientId)
      .toBe(client.id);

    expect(project.proposalId)
      .toBe("proposal-42");

    expect(project.name)
      .toBe(
        "Prepare a managed IT services proposal",
      );

    expect(project.status)
      .toBe("planned");

    expect(
      project.metadata
        ?.fromProposalId,
    ).toBe("proposal-42");

    expect(service.list())
      .toHaveLength(1);
  });

  it("falls back to the service name for the project name", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.createFromProposal({
        proposalId:
          "proposal-1",
        clientId: client.id,
        service:
          "Website Development",
      });

    expect(project.name)
      .toBe("Website Development");
  });

  it("rejects creating a project from a proposal for a missing client", () => {
    const {
      service,
    } = createProjectService();

    expect(() =>
      service.createFromProposal({
        proposalId:
          "proposal-1",
        clientId:
          "missing-client",
        service: "IT",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects an update for a missing client", () => {
    const {
      service,
      clients,
    } = createProjectService();

    const client =
      createClient(clients);

    const project =
      service.create({
        clientId: client.id,

        name:
          "Existing Project",
      });

    expect(() =>
      service.update({
        ...project,

        clientId:
          "missing-client",

        name:
          "Invalid Update",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(
      service.get(project.id)
        .name,
    ).toBe(
      "Existing Project",
    );
  });
});