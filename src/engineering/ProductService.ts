import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { ProductRecord } from "./ProductRecord";
import { ProductRepository } from "./ProductRepository";
import type { ProductRequest } from "./ProductRequest";

/**
 * Creates and manages Engineering software products.
 */
export class ProductService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new ProductRepository(),
  ) {}

  /**
   * Creates and stores a new product record.
   */
  create(
    request: ProductRequest,
  ): ProductRecord {
    // Validate the client only when one is supplied.
    if (request.clientId) {
      this.clients.get(
        request.clientId,
      );
    }

    const name =
      request.name.trim();

    if (!name) {
      throw new Error(
        "A product requires a name.",
      );
    }

    const now =
      new Date().toISOString();

    const product: ProductRecord = {
      id: randomUUID(),

      clientId:
        request.clientId,

      name,

      description:
        request.description,

      status:
        request.status ??
        "planning",

      repoUrl:
        request.repoUrl,

      language:
        request.language,

      version:
        request.version,

      lastReleaseDate:
        request.lastReleaseDate,

      owner:
        request.owner,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      product,
    );
  }

  /**
   * Returns every product.
   */
  list(): readonly ProductRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one product.
   */
  get(
    productId: string,
  ): ProductRecord {
    return this.repository.get(
      productId,
    );
  }

  /**
   * Returns all products for one client.
   */
  listForClient(
    clientId: string,
  ): readonly ProductRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing product.
   */
  update(
    product: ProductRecord,
  ): ProductRecord {
    if (product.clientId) {
      this.clients.get(
        product.clientId,
      );
    }

    return this.repository.update({
      ...product,
      name: product.name.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a product.
   */
  delete(
    productId: string,
  ): void {
    this.repository.delete(
      productId,
    );
  }
}
