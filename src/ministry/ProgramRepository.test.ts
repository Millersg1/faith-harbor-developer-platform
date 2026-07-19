import {
  describe,
  expect,
  it,
} from "vitest";

import { ProgramRepository } from "./ProgramRepository";
import type { ProgramStatus } from "./ProgramStatus";

function createProgram(
  repository: ProgramRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    name: string;
    status: ProgramStatus;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "program-1",

    clientId:
      overrides.clientId,

    name:
      overrides.name ??
      "Grief Support Group",

    category: "Grief Support",

    status:
      overrides.status ??
      "planned",

    leader: "Pastor Shawn",

    schedule: "Weekly",

    participants: 8,

    metadata: {
      location: "Fellowship Hall",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("ProgramRepository", () => {
  it("stores and retrieves programs", () => {
    const repository =
      new ProgramRepository();

    createProgram(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const program =
      repository.get("program-1");

    expect(program.name).toBe(
      "Grief Support Group",
    );

    expect(program.category).toBe(
      "Grief Support",
    );

    expect(program.status).toBe(
      "planned",
    );

    expect(program.participants).toBe(
      8,
    );
  });

  it("stores a program without a client", () => {
    const repository =
      new ProgramRepository();

    createProgram(repository);

    const program =
      repository.get("program-1");

    expect(
      program.clientId,
    ).toBeUndefined();
  });

  it("lists programs for one client", () => {
    const repository =
      new ProgramRepository();

    createProgram(repository, {
      id: "program-1",
      clientId: "client-1",
    });

    createProgram(repository, {
      id: "program-2",
      clientId: "client-2",
    });

    createProgram(repository, {
      id: "program-3",
      clientId: "client-1",
    });

    const programs =
      repository.findByClientId(
        "client-1",
      );

    expect(programs).toHaveLength(2);

    expect(
      programs.every(
        (program) =>
          program.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates a program", () => {
    const repository =
      new ProgramRepository();

    createProgram(repository);

    const existing =
      repository.get("program-1");

    const updated =
      repository.update({
        ...existing,

        status: "active",

        participants: 15,

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "active",
    );

    const stored =
      repository.get("program-1");

    expect(stored.status).toBe(
      "active",
    );

    expect(stored.participants).toBe(
      15,
    );
  });

  it("stores program metadata", () => {
    const repository =
      new ProgramRepository();

    createProgram(repository);

    const program =
      repository.get("program-1");

    expect(program.metadata).toEqual({
      location: "Fellowship Hall",
    });
  });

  it("deletes a program", () => {
    const repository =
      new ProgramRepository();

    createProgram(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("program-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when a program is missing", () => {
    const repository =
      new ProgramRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Program "missing" was not found.',
    );
  });
});
