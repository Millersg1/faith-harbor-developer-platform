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
    "Faith Harbor Test Church",
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

describe("ProgramRouter", () => {
  it("records a program", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/programs")
        .send({
          name:
            "Grief Support Group",
          category:
            "Grief Support",
          leader: "Pastor Shawn",
          schedule: "Weekly",
          participants: 8,
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("planned");

    expect(response.body.program)
      .toMatchObject({
        name:
          "Grief Support Group",
        category:
          "Grief Support",
        status: "planned",
      });

    expect(
      response.body.program.id,
    ).toBeDefined();
  });

  it("links a program to a client", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/programs")
        .send({
          clientId: client.id,
          name: "Church Program",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.program
        .clientId,
    ).toBe(client.id);
  });

  it("returns all programs", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/programs")
      .send({ name: "One" });

    await request(app)
      .post("/api/v1/programs")
      .send({ name: "Two" });

    const response =
      await request(app)
        .get("/api/v1/programs");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("filters programs by client", async () => {
    const app = createApp();

    const firstClient =
      await createClient(
        app,
        "First Church",
      );

    const secondClient =
      await createClient(
        app,
        "Second Church",
      );

    await request(app)
      .post("/api/v1/programs")
      .send({
        clientId:
          firstClient.id,
        name: "A",
      });

    await request(app)
      .post("/api/v1/programs")
      .send({
        clientId:
          secondClient.id,
        name: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/programs")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.programs[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one program", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/programs")
        .send({ name: "Details" });

    const program =
      createResponse.body.program;

    const response =
      await request(app)
        .get(
          `/api/v1/programs/${program.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(program);
  });

  it("returns 404 for a missing program", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/programs/missing",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("PROGRAM_NOT_FOUND");
  });

  it("updates a program", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/programs")
        .send({
          name: "Outreach",
          status: "planned",
        });

    const program =
      createResponse.body.program;

    const response =
      await request(app)
        .patch(
          `/api/v1/programs/${program.id}`,
        )
        .send({
          status: "active",
          participants: 20,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.status)
      .toBe("active");

    expect(response.body.program)
      .toMatchObject({
        id: program.id,
        status: "active",
        participants: 20,
      });
  });

  it("returns 404 when updating a missing program", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/programs/missing",
        )
        .send({
          status: "completed",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("PROGRAM_NOT_FOUND");
  });

  it("deletes a program", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/programs")
        .send({
          name: "To Delete",
        });

    const program =
      createResponse.body.program;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/programs/${program.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    const getResponse =
      await request(app)
        .get(
          `/api/v1/programs/${program.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("rejects an invalid program request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/programs")
        .send({ name: "" });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_PROGRAM_REQUEST",
    );
  });
});
