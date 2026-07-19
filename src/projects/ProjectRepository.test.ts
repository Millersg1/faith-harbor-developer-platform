import {
  describe,
  expect,
  it,
} from "vitest";

import { ProjectRepository } from "./ProjectRepository";

function createProject(
  repository: ProjectRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    proposalId: string;
    name: string;
    description: string;
    status:
      | "planned"
      | "active"
      | "completed"
      | "archived";
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "project-1",

    clientId:
      overrides.clientId ??
      "client-1",

    proposalId:
      overrides.proposalId,

    name:
      overrides.name ??
      "Faith Harbor Website",

    description:
      overrides.description ??
      "Build a new company website.",

    status:
      overrides.status ??
      "planned",

    metadata: {
      priority: "high",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("ProjectRepository", () => {
  it("stores and retrieves projects", () => {
    const repository =
      new ProjectRepository();

    createProject(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const project =
      repository.get("project-1");

    expect(project.clientId).toBe(
      "client-1",
    );

    expect(project.name).toBe(
      "Faith Harbor Website",
    );

    expect(project.status).toBe(
      "planned",
    );
  });

  it("stores a project linked to a proposal", () => {
    const repository =
      new ProjectRepository();

    createProject(repository, {
      proposalId: "proposal-1",
    });

    const project =
      repository.get("project-1");

    expect(project.proposalId).toBe(
      "proposal-1",
    );
  });

  it("lists all projects", () => {
    const repository =
      new ProjectRepository();

    createProject(repository, {
      id: "project-1",
      clientId: "client-1",
      name: "First Project",
    });

    createProject(repository, {
      id: "project-2",
      clientId: "client-2",
      name: "Second Project",
    });

    const projects =
      repository.list();

    expect(projects).toHaveLength(2);

    expect(
      projects.map(
        (project) =>
          project.name,
      ),
    ).toContain(
      "First Project",
    );

    expect(
      projects.map(
        (project) =>
          project.name,
      ),
    ).toContain(
      "Second Project",
    );
  });

  it("lists projects for one client", () => {
    const repository =
      new ProjectRepository();

    createProject(repository, {
      id: "project-1",
      clientId: "client-1",
      name:
        "Client One Project",
    });

    createProject(repository, {
      id: "project-2",
      clientId: "client-2",
      name:
        "Client Two Project",
    });

    createProject(repository, {
      id: "project-3",
      clientId: "client-1",
      name:
        "Second Client One Project",
    });

    const projects =
      repository.findByClientId(
        "client-1",
      );

    expect(projects).toHaveLength(2);

    expect(
      projects.every(
        (project) =>
          project.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates a project", () => {
    const repository =
      new ProjectRepository();

    createProject(repository);

    const existing =
      repository.get(
        "project-1",
      );

    const updated =
      repository.update({
        ...existing,

        name:
          "Updated Website Project",

        status:
          "active",

        notes:
          "Development has started.",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.name).toBe(
      "Updated Website Project",
    );

    expect(updated.status).toBe(
      "active",
    );

    expect(updated.notes).toBe(
      "Development has started.",
    );

    const stored =
      repository.get(
        "project-1",
      );

    expect(stored.name).toBe(
      "Updated Website Project",
    );

    expect(stored.status).toBe(
      "active",
    );

    expect(stored.notes).toBe(
      "Development has started.",
    );
  });

  it("stores project metadata", () => {
    const repository =
      new ProjectRepository();

    createProject(repository);

    const project =
      repository.get(
        "project-1",
      );

    expect(
      project.metadata,
    ).toEqual({
      priority:
        "high",
    });
  });

  it("deletes a project", () => {
    const repository =
      new ProjectRepository();

    createProject(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete(
      "project-1",
    );

    expect(
      repository.list(),
    ).toHaveLength(0);
  });
});