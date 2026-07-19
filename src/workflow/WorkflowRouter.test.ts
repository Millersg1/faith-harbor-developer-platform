import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";

describe("Workflow Router", () => {
  it("creates a workflow from a client work request", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/v1/workflows/client-request")
      .send({
        id: "proposal-001",
        clientName: "Faith Harbor LLC",
        requestedOutcome:
          "Prepare client proposal",
        department: "Client Services",
        owner: "Shawn",
        requiresApproval: true,
      });

    expect(response.status).toBe(201);

    expect(response.body.id).toBe(
      "proposal-001",
    );

    expect(response.body.name).toBe(
      "Prepare client proposal",
    );

    expect(
      response.body.metadata.clientName,
    ).toBe("Faith Harbor LLC");

    expect(
      response.body.requiresApproval,
    ).toBe(true);

    expect(response.body.state).toBe(
      "draft",
    );
  });
});