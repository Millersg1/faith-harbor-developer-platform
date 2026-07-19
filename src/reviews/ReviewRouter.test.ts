import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

async function createClient(
  app: ReturnType<typeof createApp>,
) {
  const response = await request(app)
    .post("/api/v1/clients")
    .send({
      companyName: "Grace Chapel",
      primaryContact: "Pastor John",
    });

  return response.body;
}

describe("ReviewRouter", () => {
  it("reports integration status (Google not connected by default)", async () => {
    const app = createApp();

    const response = await request(
      app,
    ).get("/api/v1/reviews/status");

    expect(response.status).toBe(200);
    expect(
      response.body.googleConnected,
    ).toBe(false);
  });

  it("sets a profile then prepares review requests", async () => {
    const app = createApp();
    const client =
      await createClient(app);

    const profile = await request(app)
      .put(
        `/api/v1/reviews/profiles/${client.id}`,
      )
      .send({
        businessName: "Grace Chapel",
        reviewUrl:
          "https://g.page/r/grace/review",
      });

    expect(profile.status).toBe(200);
    expect(profile.body.reviewUrl)
      .toBe(
        "https://g.page/r/grace/review",
      );

    const requested = await request(
      app,
    )
      .post("/api/v1/reviews/requests")
      .send({
        clientId: client.id,
        customers: [
          {
            name: "Sam",
            email: "sam@example.com",
          },
        ],
      });

    expect(requested.status).toBe(
      201,
    );
    expect(requested.body.prepared)
      .toBe(1);

    // The request became a pending automation draft.
    const drafts = await request(app)
      .get(
        "/api/v1/automations?status=pending",
      );

    const reviewDraft =
      drafts.body.drafts.find(
        (d: {
          trigger: string;
        }) =>
          d.trigger ===
          "review.requested",
      );

    expect(reviewDraft).toBeDefined();
    expect(reviewDraft.to).toBe(
      "sam@example.com",
    );
  });

  it("rejects a request with no profile set", async () => {
    const app = createApp();
    const client =
      await createClient(app);

    const response = await request(
      app,
    )
      .post("/api/v1/reviews/requests")
      .send({
        clientId: client.id,
        customers: [
          {
            name: "Sam",
            email: "sam@example.com",
          },
        ],
      });

    expect(response.status).toBe(400);
  });

  it("returns 503 when posting a reply while Google is not connected", async () => {
    const app = createApp();
    const client =
      await createClient(app);

    await request(app)
      .put(
        `/api/v1/reviews/profiles/${client.id}`,
      )
      .send({
        businessName: "Grace Chapel",
        reviewUrl:
          "https://g.page/r/grace/review",
        googlePlaceId: "place-123",
      });

    const response = await request(
      app,
    )
      .post(
        `/api/v1/reviews/${client.id}/reviews/rev-1/reply`,
      )
      .send({ reply: "Thank you!" });

    expect(response.status).toBe(503);
    expect(response.body.error.code)
      .toBe("GOOGLE_NOT_CONNECTED");
  });
});
