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

describe("LeadRouter", () => {
  it("records a lead", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/leads")
        .send({
          name: "Acme Prospect",
          company: "Acme Co",
          source: "Referral",
          estimatedValue: 5000,
          serviceInterest:
            "Website Development",
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("new");

    expect(response.body.lead)
      .toMatchObject({
        name: "Acme Prospect",
        company: "Acme Co",
        estimatedValue: 5000,
        status: "new",
      });

    expect(
      response.body.lead.id,
    ).toBeDefined();
  });

  it("links a lead to a client", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/leads")
        .send({
          clientId: client.id,
          name: "Repeat Buyer",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.lead.clientId,
    ).toBe(client.id);
  });

  it("returns all leads", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/leads")
      .send({ name: "One" });

    await request(app)
      .post("/api/v1/leads")
      .send({ name: "Two" });

    const response =
      await request(app)
        .get("/api/v1/leads");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("filters leads by client", async () => {
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
      .post("/api/v1/leads")
      .send({
        clientId:
          firstClient.id,
        name: "A",
      });

    await request(app)
      .post("/api/v1/leads")
      .send({
        clientId:
          secondClient.id,
        name: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/leads")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.leads[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one lead", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/leads")
        .send({ name: "Details" });

    const lead =
      createResponse.body.lead;

    const response =
      await request(app)
        .get(
          `/api/v1/leads/${lead.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(lead);
  });

  it("returns 404 for a missing lead", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/leads/missing",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("LEAD_NOT_FOUND");
  });

  it("moves a lead through the pipeline", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/leads")
        .send({
          name: "Pipeline Lead",
          status: "new",
        });

    const lead =
      createResponse.body.lead;

    const response =
      await request(app)
        .patch(
          `/api/v1/leads/${lead.id}`,
        )
        .send({
          status: "won",
          notes: "Closed.",
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.status)
      .toBe("won");

    expect(response.body.lead)
      .toMatchObject({
        id: lead.id,
        status: "won",
        notes: "Closed.",
      });
  });

  it("returns 404 when updating a missing lead", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/leads/missing",
        )
        .send({ status: "lost" });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("LEAD_NOT_FOUND");
  });

  it("deletes a lead", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/leads")
        .send({
          name: "To Delete",
        });

    const lead =
      createResponse.body.lead;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/leads/${lead.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    const getResponse =
      await request(app)
        .get(
          `/api/v1/leads/${lead.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("rejects an invalid lead request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/leads")
        .send({ name: "" });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_LEAD_REQUEST",
    );
  });

  it("converts a lead into a client", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/leads")
        .send({
          name: "Jordan Smith",
          company: "Acme Co",
          email:
            "jordan@acme.example",
        });

    const lead =
      createResponse.body.lead;

    const response =
      await request(app)
        .post(
          `/api/v1/leads/${lead.id}/convert`,
        );

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(
      response.body.client
        .companyName,
    ).toBe("Acme Co");

    expect(
      response.body.lead.clientId,
    ).toBe(
      response.body.client.id,
    );

    expect(response.body.lead.status)
      .toBe("won");

    // The created client is now listed.
    const clientsResponse =
      await request(app)
        .get("/api/v1/clients");

    expect(clientsResponse.body.count)
      .toBe(1);
  });

  it("returns 409 when converting an already-linked lead", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/leads")
        .send({ name: "Repeat" });

    const lead =
      createResponse.body.lead;

    await request(app)
      .post(
        `/api/v1/leads/${lead.id}/convert`,
      );

    const response =
      await request(app)
        .post(
          `/api/v1/leads/${lead.id}/convert`,
        );

    expect(response.status)
      .toBe(409);

    expect(
      response.body.error.code,
    ).toBe(
      "LEAD_ALREADY_CONVERTED",
    );
  });

  it("returns 404 when converting a missing lead", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post(
          "/api/v1/leads/missing/convert",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("LEAD_NOT_FOUND");
  });
});
