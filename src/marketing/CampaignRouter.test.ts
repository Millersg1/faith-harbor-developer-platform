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

describe("CampaignRouter", () => {
  it("records a campaign", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/campaigns")
        .send({
          name: "Spring Launch",
          channel: "Facebook",
          budget: 1000,
          audience:
            "Local churches",
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("planned");

    expect(response.body.campaign)
      .toMatchObject({
        name: "Spring Launch",
        channel: "Facebook",
        budget: 1000,
        status: "planned",
      });

    expect(
      response.body.campaign.id,
    ).toBeDefined();
  });

  it("links a campaign to a client", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/campaigns")
        .send({
          clientId: client.id,
          name: "Client Campaign",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.campaign
        .clientId,
    ).toBe(client.id);
  });

  it("returns all campaigns", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/campaigns")
      .send({ name: "One" });

    await request(app)
      .post("/api/v1/campaigns")
      .send({ name: "Two" });

    const response =
      await request(app)
        .get("/api/v1/campaigns");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("filters campaigns by client", async () => {
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
      .post("/api/v1/campaigns")
      .send({
        clientId:
          firstClient.id,
        name: "A",
      });

    await request(app)
      .post("/api/v1/campaigns")
      .send({
        clientId:
          secondClient.id,
        name: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/campaigns")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.campaigns[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one campaign", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/campaigns")
        .send({ name: "Details" });

    const campaign =
      createResponse.body.campaign;

    const response =
      await request(app)
        .get(
          `/api/v1/campaigns/${campaign.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(campaign);
  });

  it("returns 404 for a missing campaign", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/campaigns/missing",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("CAMPAIGN_NOT_FOUND");
  });

  it("updates a campaign", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/campaigns")
        .send({
          name: "Launch",
          status: "planned",
        });

    const campaign =
      createResponse.body.campaign;

    const response =
      await request(app)
        .patch(
          `/api/v1/campaigns/${campaign.id}`,
        )
        .send({
          status: "active",
          spend: 400,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.status)
      .toBe("active");

    expect(response.body.campaign)
      .toMatchObject({
        id: campaign.id,
        status: "active",
        spend: 400,
      });
  });

  it("returns 404 when updating a missing campaign", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/campaigns/missing",
        )
        .send({
          status: "completed",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("CAMPAIGN_NOT_FOUND");
  });

  it("deletes a campaign", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/campaigns")
        .send({
          name: "To Delete",
        });

    const campaign =
      createResponse.body.campaign;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/campaigns/${campaign.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    const getResponse =
      await request(app)
        .get(
          `/api/v1/campaigns/${campaign.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("rejects an invalid campaign request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/campaigns")
        .send({ name: "" });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_CAMPAIGN_REQUEST",
    );
  });
});
