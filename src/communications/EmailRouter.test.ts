import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

describe("EmailRouter", () => {
  it("sends an email and records it (logged by default)", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/emails")
        .send({
          to: "client@example.com",
          subject:
            "Your proposal",
          body:
            "The proposal is ready for review.",
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    // With no provider configured, delivery is logged only.
    expect(response.body.status)
      .toBe("logged");

    expect(response.body.email.to)
      .toBe("client@example.com");
  });

  it("returns the outbox", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/emails")
      .send({
        to: "a@example.com",
        subject: "One",
        body: "First",
      });

    await request(app)
      .post("/api/v1/emails")
      .send({
        to: "b@example.com",
        subject: "Two",
        body: "Second",
      });

    const response =
      await request(app)
        .get("/api/v1/emails");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("rejects an invalid email request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/emails")
        .send({
          to: "",
          subject: "",
          body: "",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_EMAIL_REQUEST",
    );
  });
});
