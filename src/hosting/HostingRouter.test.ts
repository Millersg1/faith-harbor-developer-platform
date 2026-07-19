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

describe("HostingRouter", () => {
  it("records a hosting account", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          clientId: client.id,
          domain:
            "faithharbor.org",
          username:
            "faithharbor",
          plan: "Business",
          status: "active",
          server: "web01",
          ipAddress:
            "203.0.113.10",
          diskUsedMb: 512,
          diskLimitMb: 5120,
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("active");

    expect(response.body.account)
      .toMatchObject({
        clientId: client.id,
        domain:
          "faithharbor.org",
        username:
          "faithharbor",
        status: "active",
      });

    expect(
      response.body.account.id,
    ).toBeDefined();
  });

  it("records an account without a client", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          domain: "example.com",
          username: "example",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.account.status,
    ).toBe("pending");
  });

  it("returns all accounts", async () => {
    const app = createApp();

    await request(app)
      .post(
        "/api/v1/hosting/accounts",
      )
      .send({
        domain: "one.example",
        username: "one",
      });

    await request(app)
      .post(
        "/api/v1/hosting/accounts",
      )
      .send({
        domain: "two.example",
        username: "two",
      });

    const response =
      await request(app)
        .get(
          "/api/v1/hosting/accounts",
        );

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("filters accounts by client", async () => {
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
      .post(
        "/api/v1/hosting/accounts",
      )
      .send({
        clientId:
          firstClient.id,
        domain: "a.example",
        username: "a",
      });

    await request(app)
      .post(
        "/api/v1/hosting/accounts",
      )
      .send({
        clientId:
          secondClient.id,
        domain: "b.example",
        username: "b",
      });

    const response =
      await request(app)
        .get(
          "/api/v1/hosting/accounts",
        )
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.accounts[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one account", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          domain: "details.example",
          username: "details",
        });

    const account =
      createResponse.body.account;

    const response =
      await request(app)
        .get(
          `/api/v1/hosting/accounts/${account.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(account);
  });

  it("returns 404 for a missing account", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/hosting/accounts/missing",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe(
      "HOSTING_ACCOUNT_NOT_FOUND",
    );
  });

  it("updates an account", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          domain: "update.example",
          username: "update",
          status: "active",
        });

    const account =
      createResponse.body.account;

    const response =
      await request(app)
        .patch(
          `/api/v1/hosting/accounts/${account.id}`,
        )
        .send({
          status: "suspended",
          notes: "Over quota.",
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.status)
      .toBe("suspended");

    expect(response.body.account)
      .toMatchObject({
        id: account.id,
        status: "suspended",
        notes: "Over quota.",
      });
  });

  it("deletes an account", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          domain: "delete.example",
          username: "delete",
        });

    const account =
      createResponse.body.account;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/hosting/accounts/${account.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    const getResponse =
      await request(app)
        .get(
          `/api/v1/hosting/accounts/${account.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("rejects an invalid account request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          domain: "",
          username: "",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_HOSTING_ACCOUNT_REQUEST",
    );
  });

  it("filters accounts by brand", async () => {
    const app = createApp();

    await request(app)
      .post(
        "/api/v1/hosting/accounts",
      )
      .send({
        domain: "elite.example",
        username: "elite",
        brand: "All Elite Hosting",
      });

    await request(app)
      .post(
        "/api/v1/hosting/accounts",
      )
      .send({
        domain: "harbor.example",
        username: "harbor",
        brand:
          "Faith Harbor Web Hosting",
      });

    const response =
      await request(app)
        .get(
          "/api/v1/hosting/accounts",
        )
        .query({
          brand:
            "All Elite Hosting",
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.accounts[0]
        .brand,
    ).toBe("All Elite Hosting");
  });

  it("diagnoses an account with the hosting assistant", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post(
          "/api/v1/hosting/accounts",
        )
        .send({
          domain:
            "diagnose.example",
          username: "diagnose",
          status: "suspended",
          diskUsedMb: 4900,
          diskLimitMb: 5000,
        });

    const account =
      createResponse.body.account;

    const response =
      await request(app)
        .post(
          "/api/v1/hosting/assist",
        )
        .send({
          accountId: account.id,
        });

    expect(response.status)
      .toBe(200);

    const codes =
      response.body.assessment.findings.map(
        (finding: {
          code: string;
        }) => finding.code,
      );

    expect(codes).toContain(
      "ACCOUNT_SUSPENDED",
    );

    expect(codes).toContain(
      "DISK_CRITICAL",
    );

    expect(
      response.body.assessment
        .recommendation,
    ).toBeDefined();
  });

  it("returns 404 when diagnosing a missing account", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post(
          "/api/v1/hosting/assist",
        )
        .send({
          accountId:
            "missing-account",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe(
      "HOSTING_ACCOUNT_NOT_FOUND",
    );
  });

  it("reports that WHM is not configured", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get("/api/v1/hosting/whm");

    expect(response.status)
      .toBe(200);

    expect(
      response.body.configured,
    ).toBe(false);
  });

  it("returns 503 for WHM status when not configured", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/hosting/whm/status",
        );

    expect(response.status)
      .toBe(503);

    expect(
      response.body.error.code,
    ).toBe(
      "WHM_NOT_CONFIGURED",
    );
  });

  it("returns 503 for WHM accounts when not configured", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/hosting/whm/accounts",
        );

    expect(response.status)
      .toBe(503);

    expect(
      response.body.error.code,
    ).toBe(
      "WHM_NOT_CONFIGURED",
    );
  });
});
