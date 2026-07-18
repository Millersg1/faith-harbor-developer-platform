import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

async function createClient(
  app: ReturnType<typeof createApp>,
  companyName =
    "Faith Harbor Test Client",
) {
  const response =
    await request(app)
      .post("/api/v1/clients")
      .send({
        companyName,
        primaryContact:
          "Jordan Smith",
      });

  expect(response.status)
    .toBe(201);

  return response.body;
}

describe("TicketRouter", () => {
  it("opens a ticket", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/tickets")
        .send({
          clientId: client.id,
          projectId:
            "project-1",
          subject:
            "Email is bouncing",
          description:
            "Outgoing mail fails.",
          priority: "high",
          metadata: {
            channel: "phone",
          },
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("open");

    expect(response.body.ticket)
      .toMatchObject({
        clientId: client.id,
        projectId:
          "project-1",
        number: "TICKET-0001",
        subject:
          "Email is bouncing",
        priority: "high",
        status: "open",
      });

    expect(
      response.body.ticket.id,
    ).toBeDefined();

    expect(
      response.body.ticket
        .createdAt,
    ).toBeDefined();
  });

  it("defaults priority to medium", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/tickets")
        .send({
          clientId: client.id,
          subject:
            "General question",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.ticket.priority,
    ).toBe("medium");
  });

  it("returns all tickets", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    await request(app)
      .post("/api/v1/tickets")
      .send({
        clientId: client.id,
        subject: "First",
      });

    await request(app)
      .post("/api/v1/tickets")
      .send({
        clientId: client.id,
        subject: "Second",
      });

    const response =
      await request(app)
        .get("/api/v1/tickets");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);

    expect(
      response.body.tickets,
    ).toHaveLength(2);
  });

  it("filters tickets by client", async () => {
    const app = createApp();

    const firstClient =
      await createClient(
        app,
        "First Client",
      );

    const secondClient =
      await createClient(
        app,
        "Second Client",
      );

    await request(app)
      .post("/api/v1/tickets")
      .send({
        clientId:
          firstClient.id,
        subject: "A",
      });

    await request(app)
      .post("/api/v1/tickets")
      .send({
        clientId:
          secondClient.id,
        subject: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/tickets")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.tickets[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one ticket", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/tickets")
        .send({
          clientId: client.id,
          subject: "Details",
        });

    const ticket =
      createResponse.body.ticket;

    const response =
      await request(app)
        .get(
          `/api/v1/tickets/${ticket.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(ticket);
  });

  it("returns 404 for a missing ticket", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/tickets/missing-ticket",
        );

    expect(response.status)
      .toBe(404);

    expect(response.body)
      .toEqual({
        error: {
          code:
            "TICKET_NOT_FOUND",
          message:
            'Ticket "missing-ticket" was not found.',
        },
      });
  });

  it("updates a ticket", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/tickets")
        .send({
          clientId: client.id,
          subject: "Original",
          status: "open",
        });

    const ticket =
      createResponse.body.ticket;

    const response =
      await request(app)
        .patch(
          `/api/v1/tickets/${ticket.id}`,
        )
        .send({
          status: "resolved",
          resolution:
            "Restarted the service.",
          resolvedDate:
            "2026-07-25",
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("resolved");

    expect(response.body.ticket)
      .toMatchObject({
        id: ticket.id,
        status: "resolved",
        resolution:
          "Restarted the service.",
        resolvedDate:
          "2026-07-25",
      });

    const getResponse =
      await request(app)
        .get(
          `/api/v1/tickets/${ticket.id}`,
        );

    expect(getResponse.body)
      .toEqual(
        response.body.ticket,
      );
  });

  it("returns 404 when updating a missing ticket", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/tickets/missing-ticket",
        )
        .send({
          status: "closed",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe(
      "TICKET_NOT_FOUND",
    );
  });

  it("deletes a ticket", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/tickets")
        .send({
          clientId: client.id,
          subject: "To Delete",
        });

    const ticket =
      createResponse.body.ticket;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/tickets/${ticket.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    expect(deleteResponse.text)
      .toBe("");

    const getResponse =
      await request(app)
        .get(
          `/api/v1/tickets/${ticket.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("returns 404 when deleting a missing ticket", async () => {
    const app = createApp();

    const response =
      await request(app)
        .delete(
          "/api/v1/tickets/missing-ticket",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe(
      "TICKET_NOT_FOUND",
    );
  });

  it("rejects an invalid ticket request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/tickets")
        .send({
          clientId: "",
          subject: "",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_TICKET_REQUEST",
    );

    expect(
      response.body.error.message,
    ).toBe(
      "Ticket request validation failed.",
    );

    expect(
      response.body.error.details,
    ).toBeDefined();
  });

  it("returns an internal error when opening a ticket for a missing client", async () => {
    const app = createApp();

    const consoleError =
      console.error;

    console.error = () => {
      // The application error handler
      // intentionally logs this error.
    };

    try {
      const response =
        await request(app)
          .post(
            "/api/v1/tickets",
          )
          .send({
            clientId:
              "missing-client",
            subject:
              "Invalid ticket",
          });

      expect(response.status)
        .toBe(500);

      expect(response.body)
        .toEqual({
          error: {
            code:
              "INTERNAL_ERROR",
            message:
              "An unexpected error occurred.",
          },
        });
    } finally {
      console.error =
        consoleError;
    }
  });
});
