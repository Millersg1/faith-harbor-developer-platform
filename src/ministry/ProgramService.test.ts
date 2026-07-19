import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { ProgramRepository } from "./ProgramRepository";
import { ProgramService } from "./ProgramService";

function createProgramService() {
  const clients =
    new ClientService();

  const repository =
    new ProgramRepository();

  const service =
    new ProgramService(
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
    "Grace Church",
) {
  return clients.create({
    companyName,

    primaryContact:
      "Jordan Smith",
  });
}

describe("ProgramService", () => {
  it("creates and saves a program", () => {
    const {
      service,
    } = createProgramService();

    const program =
      service.create({
        name:
          "  Grief Support Group  ",
        category: "Grief Support",
        leader: "Pastor Shawn",
        schedule: "Weekly",
      });

    expect(program.id)
      .toBeDefined();

    expect(program.name)
      .toBe("Grief Support Group");

    expect(program.category)
      .toBe("Grief Support");

    expect(program.status)
      .toBe("planned");

    expect(service.list())
      .toEqual([program]);
  });

  it("links a program to a client", () => {
    const {
      service,
      clients,
    } = createProgramService();

    const client =
      createClient(clients);

    const program =
      service.create({
        clientId: client.id,
        name: "Church Program",
      });

    expect(program.clientId)
      .toBe(client.id);
  });

  it("defaults status to planned", () => {
    const {
      service,
    } = createProgramService();

    const program =
      service.create({
        name: "New Program",
      });

    expect(program.status)
      .toBe("planned");
  });

  it("lists programs for one client", () => {
    const {
      service,
      clients,
    } = createProgramService();

    const firstClient =
      createClient(
        clients,
        "First Church",
      );

    const secondClient =
      createClient(
        clients,
        "Second Church",
      );

    const firstProgram =
      service.create({
        clientId:
          firstClient.id,
        name: "A",
      });

    service.create({
      clientId:
        secondClient.id,
      name: "B",
    });

    const thirdProgram =
      service.create({
        clientId:
          firstClient.id,
        name: "C",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstProgram,
      thirdProgram,
    ]);
  });

  it("activates a program on update", () => {
    const {
      service,
    } = createProgramService();

    const program =
      service.create({
        name: "Outreach",
        status: "planned",
      });

    const updated =
      service.update({
        ...program,

        status: "active",

        participants: 20,
      });

    expect(updated.status)
      .toBe("active");

    expect(
      service.get(program.id)
        .participants,
    ).toBe(20);
  });

  it("deletes a program", () => {
    const {
      service,
    } = createProgramService();

    const program =
      service.create({
        name: "To Delete",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(program.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a program with no name", () => {
    const {
      service,
    } = createProgramService();

    expect(() =>
      service.create({
        name: "   ",
      }),
    ).toThrow(
      "A ministry program requires a name.",
    );
  });

  it("rejects a program for a missing client", () => {
    const {
      service,
    } = createProgramService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        name: "Bad Program",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
