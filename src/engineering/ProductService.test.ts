import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { ProductRepository } from "./ProductRepository";
import { ProductService } from "./ProductService";

function createProductService() {
  const clients =
    new ClientService();

  const repository =
    new ProductRepository();

  const service =
    new ProductService(
      clients,
      repository,
    );

  return {
    service,
    clients,
    repository,
  };
}

function createClient(
  clients: ClientService,
  companyName =
    "Acme Manufacturing",
) {
  return clients.create({
    companyName,

    primaryContact:
      "Jordan Smith",
  });
}

describe("ProductService", () => {
  it("creates and saves a product", () => {
    const {
      service,
    } = createProductService();

    const product =
      service.create({
        name: "  Faith Harbor OS  ",
        language: "TypeScript",
        version: "4.2.0",
        status: "active",
      });

    expect(product.id)
      .toBeDefined();

    expect(product.name)
      .toBe("Faith Harbor OS");

    expect(product.status)
      .toBe("active");

    expect(product.version)
      .toBe("4.2.0");

    expect(service.list())
      .toEqual([product]);
  });

  it("links a product to a client", () => {
    const {
      service,
      clients,
    } = createProductService();

    const client =
      createClient(clients);

    const product =
      service.create({
        clientId: client.id,
        name: "Client App",
      });

    expect(product.clientId)
      .toBe(client.id);
  });

  it("defaults status to planning", () => {
    const {
      service,
    } = createProductService();

    const product =
      service.create({
        name: "New Product",
      });

    expect(product.status)
      .toBe("planning");
  });

  it("lists products for one client", () => {
    const {
      service,
      clients,
    } = createProductService();

    const firstClient =
      createClient(
        clients,
        "First Client",
      );

    const secondClient =
      createClient(
        clients,
        "Second Client",
      );

    const firstProduct =
      service.create({
        clientId:
          firstClient.id,
        name: "A",
      });

    service.create({
      clientId:
        secondClient.id,
      name: "B",
    });

    const thirdProduct =
      service.create({
        clientId:
          firstClient.id,
        name: "C",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstProduct,
      thirdProduct,
    ]);
  });

  it("releases a product on update", () => {
    const {
      service,
    } = createProductService();

    const product =
      service.create({
        name: "Platform",
        status: "active",
      });

    const updated =
      service.update({
        ...product,

        status: "maintenance",

        version: "1.0.0",
      });

    expect(updated.status)
      .toBe("maintenance");

    expect(
      service.get(product.id)
        .version,
    ).toBe("1.0.0");
  });

  it("deletes a product", () => {
    const {
      service,
    } = createProductService();

    const product =
      service.create({
        name: "To Delete",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(product.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a product with no name", () => {
    const {
      service,
    } = createProductService();

    expect(() =>
      service.create({
        name: "   ",
      }),
    ).toThrow(
      "A product requires a name.",
    );
  });

  it("rejects a product for a missing client", () => {
    const {
      service,
    } = createProductService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        name: "Bad Product",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
