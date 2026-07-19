import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

describe("Client Router", () => {
  it("creates and lists a client", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/clients")
        .send({
          companyName:
            "Acme Manufacturing",
          primaryContact:
            "Jordan Smith",
          email:
            "jordan@example.com",
          industry:
            "Manufacturing",
        });

    expect(createResponse.status)
      .toBe(201);

    expect(
      createResponse.body.companyName,
    ).toBe(
      "Acme Manufacturing",
    );

    const listResponse =
      await request(app)
        .get("/api/v1/clients");

    expect(listResponse.status)
      .toBe(200);

    expect(listResponse.body.count)
      .toBe(1);

    expect(
      listResponse.body.clients[0]
        .companyName,
    ).toBe(
      "Acme Manufacturing",
    );
  });

  it("returns one client", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/clients")
        .send({
          companyName:
            "Faith Harbor LLC",
          primaryContact:
            "Shawn Miller",
        });

    const clientId =
      createResponse.body.id;

    const response =
      await request(app)
        .get(
          `/api/v1/clients/${clientId}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body.id)
      .toBe(clientId);
  });

  it("returns a client workspace", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/clients")
        .send({
          companyName:
            "Workspace Client",
          primaryContact:
            "Client Contact",
        });

    const response =
      await request(app)
        .get(
          `/api/v1/clients/${createResponse.body.id}/workspace`,
        );

    expect(response.status)
      .toBe(200);

    expect(
      response.body.client.companyName,
    ).toBe(
      "Workspace Client",
    );

    expect(
      response.body.proposals,
    ).toEqual([]);
  });

  it("rejects invalid client information", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/clients")
        .send({
          companyName: "",
          primaryContact: "",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_CLIENT_REQUEST",
    );
  });
});