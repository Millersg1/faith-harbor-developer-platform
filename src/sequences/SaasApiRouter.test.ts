import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

type App = ReturnType<typeof createApp>;

async function createApiKey(
  app: App,
): Promise<string> {
  const res = await request(app)
    .post("/api/v1/api-keys")
    .send({ name: "SaaS Surface" });

  expect(res.status).toBe(201);

  return res.body.key as string;
}

describe("SaaS Surface API (/api/zapier)", () => {
  it("rejects requests without a valid API key", async () => {
    const app = createApp();

    const res = await request(app).get(
      "/api/zapier/me",
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(
      "INVALID_API_KEY",
    );
  });

  it("answers /me for a valid key", async () => {
    const app = createApp();

    const key = await createApiKey(app);

    const res = await request(app)
      .get("/api/zapier/me")
      .set("X-API-Key", key);

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(
      res.body,
    ).toHaveProperty("brand_id");
  });

  it("creates a workflow and enrolls a contact end to end", async () => {
    const app = createApp();

    const key = await createApiKey(app);

    const workflowRes = await request(
      app,
    )
      .post(
        "/api/zapier/actions/create-workflow",
      )
      .set("X-API-Key", key)
      .send({
        name: "Buyer onboarding",
        steps: [
          {
            subject:
              "Welcome {{first_name}}",
            body: "Thanks for your purchase.",
          },
          {
            subject: "Getting started",
            body: "Here's how to begin.",
            delay_days: 1,
          },
        ],
      });

    expect(workflowRes.status).toBe(
      201,
    );

    const workflowId =
      workflowRes.body.workflow.id;

    expect(workflowId).toBeTruthy();
    expect(
      workflowRes.body.workflow.steps,
    ).toBe(2);

    const enrollRes = await request(app)
      .post(
        "/api/zapier/actions/enroll-in-workflow",
      )
      .set("X-API-Key", key)
      .send({
        email: "buyer@example.com",
        workflow_id: workflowId,
        first_name: "Sam",
        last_name: "Rivera",
      });

    expect(enrollRes.status).toBe(201);
    expect(
      enrollRes.body.enrollment.status,
    ).toBe("active");
    expect(
      enrollRes.body.client.email,
    ).toBe("buyer@example.com");
  });

  it("prevents a key from enrolling into another brand's workflow", async () => {
    const app = createApp();

    // Brand A with its own API key creates a workflow.
    const brandRes = await request(app)
      .post("/api/v1/brands")
      .send({ name: "Brand A" });

    const brandId = brandRes.body.id;

    const brandKeyRes = await request(
      app,
    )
      .post("/api/v1/api-keys")
      .send({
        name: "Brand A key",
        brandId,
      });

    const brandKey =
      brandKeyRes.body.key as string;

    const workflowRes = await request(
      app,
    )
      .post(
        "/api/zapier/actions/create-workflow",
      )
      .set("X-API-Key", brandKey)
      .send({
        name: "Brand A onboarding",
        steps: [
          {
            subject: "Welcome",
            body: "Hi",
          },
        ],
      });

    const workflowId =
      workflowRes.body.workflow.id;

    // A different (unbranded) key must not reach Brand A's workflow.
    const otherKey = await createApiKey(
      app,
    );

    const res = await request(app)
      .post(
        "/api/zapier/actions/enroll-in-workflow",
      )
      .set("X-API-Key", otherKey)
      .send({
        email: "buyer@example.com",
        workflow_id: workflowId,
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(
      "ENROLLMENT_FAILED",
    );
  });

  it("rejects enrollment into an unknown workflow", async () => {
    const app = createApp();

    const key = await createApiKey(app);

    const res = await request(app)
      .post(
        "/api/zapier/actions/enroll-in-workflow",
      )
      .set("X-API-Key", key)
      .send({
        email: "buyer@example.com",
        workflow_id: "does-not-exist",
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(
      "ENROLLMENT_FAILED",
    );
  });

  it("validates workflow input", async () => {
    const app = createApp();

    const key = await createApiKey(app);

    const res = await request(app)
      .post(
        "/api/zapier/actions/create-workflow",
      )
      .set("X-API-Key", key)
      .send({ name: "No steps", steps: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(
      "INVALID_WORKFLOW",
    );
  });
});
