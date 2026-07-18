import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { TicketRepository } from "./TicketRepository";
import { TicketService } from "./TicketService";

function createTicketService() {
  const clients =
    new ClientService();

  const repository =
    new TicketRepository();

  const service =
    new TicketService(
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

describe("TicketService", () => {
  it("creates and saves a ticket", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    const ticket =
      service.create({
        clientId: client.id,

        subject:
          "  Website is down  ",

        description:
          "Homepage returns a 500 error.",

        priority: "urgent",

        metadata: {
          channel: "email",
        },
      });

    expect(ticket.id)
      .toBeDefined();

    expect(ticket.clientId)
      .toBe(client.id);

    expect(ticket.number)
      .toBe("TICKET-0001");

    expect(ticket.subject)
      .toBe("Website is down");

    expect(ticket.status)
      .toBe("open");

    expect(ticket.priority)
      .toBe("urgent");

    expect(ticket.metadata)
      .toEqual({
        channel: "email",
      });

    expect(ticket.createdAt)
      .toBeDefined();

    expect(service.list())
      .toEqual([ticket]);
  });

  it("defaults status to open and priority to medium", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    const ticket =
      service.create({
        clientId: client.id,
        subject: "General question",
      });

    expect(ticket.status)
      .toBe("open");

    expect(ticket.priority)
      .toBe("medium");
  });

  it("generates sequential ticket numbers", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    const first =
      service.create({
        clientId: client.id,
        subject: "First",
      });

    const second =
      service.create({
        clientId: client.id,
        subject: "Second",
      });

    expect(first.number)
      .toBe("TICKET-0001");

    expect(second.number)
      .toBe("TICKET-0002");
  });

  it("honors an explicit ticket number and status", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    const ticket =
      service.create({
        clientId: client.id,

        number: "  CASE-1  ",

        status: "in_progress",

        subject: "Escalation",
      });

    expect(ticket.number)
      .toBe("CASE-1");

    expect(ticket.status)
      .toBe("in_progress");
  });

  it("resolves a ticket on update", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    const ticket =
      service.create({
        clientId: client.id,
        subject: "Open ticket",
      });

    const updated =
      service.update({
        ...ticket,

        status: "resolved",

        resolution:
          "Cleared the cache.",

        resolvedDate:
          "2026-07-21",
      });

    expect(updated.status)
      .toBe("resolved");

    expect(updated.resolution)
      .toBe("Cleared the cache.");

    expect(
      service.get(ticket.id)
        .status,
    ).toBe("resolved");
  });

  it("lists tickets for one client", () => {
    const {
      service,
      clients,
    } = createTicketService();

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

    const firstTicket =
      service.create({
        clientId:
          firstClient.id,
        subject: "A",
      });

    service.create({
      clientId:
        secondClient.id,
      subject: "B",
    });

    const thirdTicket =
      service.create({
        clientId:
          firstClient.id,
        subject: "C",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstTicket,
      thirdTicket,
    ]);
  });

  it("deletes a ticket", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    const ticket =
      service.create({
        clientId: client.id,
        subject: "To delete",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(ticket.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a ticket with an empty subject", () => {
    const {
      service,
      clients,
    } = createTicketService();

    const client =
      createClient(clients);

    expect(() =>
      service.create({
        clientId: client.id,
        subject: "   ",
      }),
    ).toThrow(
      "A support ticket requires a subject.",
    );

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a ticket for a missing client", () => {
    const {
      service,
    } = createTicketService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        subject: "Invalid",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
