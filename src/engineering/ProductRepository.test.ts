import {
  describe,
  expect,
  it,
} from "vitest";

import { ProductRepository } from "./ProductRepository";
import type { ProductStatus } from "./ProductStatus";

function createProduct(
  repository: ProductRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    name: string;
    status: ProductStatus;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "product-1",

    clientId:
      overrides.clientId,

    name:
      overrides.name ??
      "Faith Harbor OS",

    description:
      "The governed operating platform.",

    status:
      overrides.status ??
      "active",

    repoUrl:
      "https://github.com/example/repo",

    language: "TypeScript",

    version: "4.2.0",

    owner: "Shawn",

    metadata: {
      visibility: "private",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("ProductRepository", () => {
  it("stores and retrieves products", () => {
    const repository =
      new ProductRepository();

    createProduct(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const product =
      repository.get("product-1");

    expect(product.name).toBe(
      "Faith Harbor OS",
    );

    expect(product.language).toBe(
      "TypeScript",
    );

    expect(product.status).toBe(
      "active",
    );

    expect(product.version).toBe(
      "4.2.0",
    );
  });

  it("stores a product without a client", () => {
    const repository =
      new ProductRepository();

    createProduct(repository);

    const product =
      repository.get("product-1");

    expect(
      product.clientId,
    ).toBeUndefined();
  });

  it("lists products for one client", () => {
    const repository =
      new ProductRepository();

    createProduct(repository, {
      id: "product-1",
      clientId: "client-1",
    });

    createProduct(repository, {
      id: "product-2",
      clientId: "client-2",
    });

    createProduct(repository, {
      id: "product-3",
      clientId: "client-1",
    });

    const products =
      repository.findByClientId(
        "client-1",
      );

    expect(products).toHaveLength(2);

    expect(
      products.every(
        (product) =>
          product.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates a product", () => {
    const repository =
      new ProductRepository();

    createProduct(repository);

    const existing =
      repository.get("product-1");

    const updated =
      repository.update({
        ...existing,

        status: "maintenance",

        version: "4.3.0",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "maintenance",
    );

    const stored =
      repository.get("product-1");

    expect(stored.status).toBe(
      "maintenance",
    );

    expect(stored.version).toBe(
      "4.3.0",
    );
  });

  it("stores product metadata", () => {
    const repository =
      new ProductRepository();

    createProduct(repository);

    const product =
      repository.get("product-1");

    expect(product.metadata).toEqual({
      visibility: "private",
    });
  });

  it("deletes a product", () => {
    const repository =
      new ProductRepository();

    createProduct(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("product-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when a product is missing", () => {
    const repository =
      new ProductRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Product "missing" was not found.',
    );
  });
});
