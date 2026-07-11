import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("Workflow API", () => {
  it("creates and advances an approval workflow", async () => {
    const app = createApp();

    const createResponse = await request(app).post("/api/v1/workflows").send({
      id: "publish-devotional",
      name: "Publish Devotional",
      department: "Publishing",
      owner: "Shawn",
      requiresApproval: true,
      steps: [],
    });

    expect(createResponse.status).toBe(201);

    await request(app)
      .post("/api/v1/workflows/publish-devotional/submit")
      .send({ actor: "Shawn" });

    const startResponse = await request(app)
      .post("/api/v1/workflows/publish-devotional/start")
      .send({ actor: "OpenClaw" });

    expect(startResponse.body.state).toBe("waiting_for_approval");

    const approveResponse = await request(app)
      .post("/api/v1/workflows/publish-devotional/approve")
      .send({ actor: "Shawn" });

    expect(approveResponse.body.state).toBe("approved");
  });
});
