import {
  describe,
  expect,
  it,
} from "vitest";

import { TicketRepository } from "./TicketRepository";
import type { TicketPriority } from "./TicketPriority";
import type { TicketStatus } from "./TicketStatus";

function createTicket(
  repository: TicketRepository,
  overrides: Partial<{
    id: string;
    number: string;
    clientId: string;
    projectId: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "ticket-1",

    number:
      overrides.number ??
      "TICKET-0001",

    clientId:
      overrides.clientId ??
      "client-1",

    projectId:
      overrides.projectId,

    subject:
      overrides.subject ??
      "Email is not working",

    description:
      "The mailbox is rejecting messages.",

    status:
      overrides.status ??
      "open",

    priority:
      overrides.priority ??
      "high",

    metadata: {
      channel: "phone",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("TicketRepository", () => {
  it("stores and retrieves tickets", () => {
    const repository =
      new TicketRepository();

    createTicket(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const ticket =
      repository.get("ticket-1");

    expect(ticket.number).toBe(
      "TICKET-0001",
    );

    expect(ticket.subject).toBe(
      "Email is not working",
    );

    expect(ticket.status).toBe(
      "open",
    );

    expect(ticket.priority).toBe(
      "high",
    );
  });

  it("stores a ticket linked to a project", () => {
    const repository =
      new TicketRepository();

    createTicket(repository, {
      projectId: "project-1",
    });

    const ticket =
      repository.get("ticket-1");

    expect(ticket.projectId).toBe(
      "project-1",
    );
  });

  it("lists tickets for one client", () => {
    const repository =
      new TicketRepository();

    createTicket(repository, {
      id: "ticket-1",
      clientId: "client-1",
    });

    createTicket(repository, {
      id: "ticket-2",
      clientId: "client-2",
    });

    createTicket(repository, {
      id: "ticket-3",
      clientId: "client-1",
    });

    const tickets =
      repository.findByClientId(
        "client-1",
      );

    expect(tickets).toHaveLength(2);

    expect(
      tickets.every(
        (ticket) =>
          ticket.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("counts stored tickets", () => {
    const repository =
      new TicketRepository();

    expect(repository.count()).toBe(
      0,
    );

    createTicket(repository, {
      id: "ticket-1",
    });

    createTicket(repository, {
      id: "ticket-2",
    });

    expect(repository.count()).toBe(
      2,
    );
  });

  it("updates a ticket", () => {
    const repository =
      new TicketRepository();

    createTicket(repository);

    const existing =
      repository.get("ticket-1");

    const updated =
      repository.update({
        ...existing,

        status: "resolved",

        resolution:
          "Reset the mailbox quota.",

        resolvedDate:
          "2026-07-20",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "resolved",
    );

    const stored =
      repository.get("ticket-1");

    expect(stored.status).toBe(
      "resolved",
    );

    expect(stored.resolution).toBe(
      "Reset the mailbox quota.",
    );

    expect(stored.resolvedDate).toBe(
      "2026-07-20",
    );
  });

  it("stores ticket metadata", () => {
    const repository =
      new TicketRepository();

    createTicket(repository);

    const ticket =
      repository.get("ticket-1");

    expect(ticket.metadata).toEqual({
      channel: "phone",
    });
  });

  it("deletes a ticket", () => {
    const repository =
      new TicketRepository();

    createTicket(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("ticket-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when a ticket is missing", () => {
    const repository =
      new TicketRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Ticket "missing" was not found.',
    );
  });
});
