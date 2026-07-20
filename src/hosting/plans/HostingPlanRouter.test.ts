import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../../app";

describe("HostingPlanRouter", () => {
  it("seeds the standard NVMe shared plans", async () => {
    const app = createApp();

    const res = await request(app).get(
      "/api/v1/hosting/plans",
    );

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(4);

    const names =
      res.body.plans.map(
        (p: { name: string }) => p.name,
      );

    expect(names).toEqual([
      "Starter NVMe",
      "Business NVMe",
      "Pro NVMe",
      "Elite NVMe",
    ]);

    const business =
      res.body.plans.find(
        (p: { name: string }) =>
          p.name === "Business NVMe",
      );

    expect(
      business.priceMonthlyCents,
    ).toBe(999);
    expect(business.popular).toBe(true);
    expect(business.specs.websites).toBe(
      5,
    );
    expect(business.whmPackage).toBe(
      "Business NVMe",
    );
  });

  it("creates, updates, and deletes a plan", async () => {
    const app = createApp();

    const created = await request(app)
      .post("/api/v1/hosting/plans")
      .send({
        name: "Test Plan",
        priceMonthlyCents: 1500,
        specs: {
          storageMb: 20480,
          bandwidthGb: 200,
          websites: 3,
          emailAccounts: 20,
          mysqlDatabases: 8,
        },
      });

    expect(created.status).toBe(201);
    expect(created.body.slug).toBe(
      "test-plan",
    );
    // Yearly defaults to 20% off the annual total.
    expect(
      created.body.priceYearlyCents,
    ).toBe(Math.round(1500 * 12 * 0.8));

    const id = created.body.id;

    const updated = await request(app)
      .put(`/api/v1/hosting/plans/${id}`)
      .send({
        name: "Test Plan",
        priceMonthlyCents: 1500,
        specs: {
          storageMb: 20480,
          bandwidthGb: 200,
          websites: 3,
          emailAccounts: 20,
          mysqlDatabases: 8,
        },
        active: false,
      });

    expect(updated.body.active).toBe(
      false,
    );

    const del = await request(app).delete(
      `/api/v1/hosting/plans/${id}`,
    );

    expect(del.status).toBe(200);
  });

  it("rejects a plan with no name", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/api/v1/hosting/plans")
      .send({
        priceMonthlyCents: 500,
        specs: {
          storageMb: 1,
          bandwidthGb: 1,
          websites: 1,
          emailAccounts: 1,
          mysqlDatabases: 1,
        },
      });

    expect(res.status).toBe(400);
  });
});
