import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../../app";

describe("ProvisioningRouter", () => {
  it("reports provisioning unavailable when WHM is not configured", async () => {
    const app = createApp();

    const status = await request(
      app,
    ).get(
      "/api/v1/hosting/provision/status",
    );

    expect(status.status).toBe(200);
    expect(status.body.available).toBe(
      false,
    );
  });

  it("returns 503 when asked to provision without WHM", async () => {
    const app = createApp();

    const res = await request(app)
      .post(
        "/api/v1/hosting/provision",
      )
      .send({
        planSlug: "starter-nvme",
        domain: "example.com",
        contactEmail: "a@b.com",
      });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe(
      "PROVISIONING_UNAVAILABLE",
    );
  });
});
