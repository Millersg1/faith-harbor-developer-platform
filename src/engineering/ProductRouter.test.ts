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

describe("ProductRouter", () => {
  it("records a product", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/products")
        .send({
          name: "Faith Harbor OS",
          language: "TypeScript",
          version: "4.2.0",
          status: "active",
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("active");

    expect(response.body.product)
      .toMatchObject({
        name: "Faith Harbor OS",
        language: "TypeScript",
        version: "4.2.0",
        status: "active",
      });

    expect(
      response.body.product.id,
    ).toBeDefined();
  });

  it("links a product to a client", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/products")
        .send({
          clientId: client.id,
          name: "Client App",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.product
        .clientId,
    ).toBe(client.id);
  });

  it("returns all products", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/products")
      .send({ name: "One" });

    await request(app)
      .post("/api/v1/products")
      .send({ name: "Two" });

    const response =
      await request(app)
        .get("/api/v1/products");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("filters products by client", async () => {
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
      .post("/api/v1/products")
      .send({
        clientId:
          firstClient.id,
        name: "A",
      });

    await request(app)
      .post("/api/v1/products")
      .send({
        clientId:
          secondClient.id,
        name: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/products")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.products[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one product", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/products")
        .send({ name: "Details" });

    const product =
      createResponse.body.product;

    const response =
      await request(app)
        .get(
          `/api/v1/products/${product.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(product);
  });

  it("returns 404 for a missing product", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/products/missing",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("PRODUCT_NOT_FOUND");
  });

  it("updates a product", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/products")
        .send({
          name: "Platform",
          status: "active",
        });

    const product =
      createResponse.body.product;

    const response =
      await request(app)
        .patch(
          `/api/v1/products/${product.id}`,
        )
        .send({
          status: "maintenance",
          version: "1.0.0",
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.status)
      .toBe("maintenance");

    expect(response.body.product)
      .toMatchObject({
        id: product.id,
        status: "maintenance",
        version: "1.0.0",
      });
  });

  it("returns 404 when updating a missing product", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/products/missing",
        )
        .send({
          status: "archived",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("PRODUCT_NOT_FOUND");
  });

  it("deletes a product", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/products")
        .send({
          name: "To Delete",
        });

    const product =
      createResponse.body.product;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/products/${product.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    const getResponse =
      await request(app)
        .get(
          `/api/v1/products/${product.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("rejects an invalid product request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/products")
        .send({ name: "" });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_PRODUCT_REQUEST",
    );
  });
});
