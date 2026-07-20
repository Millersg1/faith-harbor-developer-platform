import { randomUUID } from "node:crypto";

import { BrandRepository } from "./BrandRepository";
import type {
  BrandRecord,
  BrandRequest,
} from "./BrandTypes";

/**
 * Creates and manages the brands run under the organization.
 */
export class BrandService {
  constructor(
    private readonly repository =
      new BrandRepository(),
  ) {}

  create(
    request: BrandRequest,
  ): BrandRecord {
    const name =
      request.name.trim();

    if (!name) {
      throw new Error(
        "A brand requires a name.",
      );
    }

    const now =
      new Date().toISOString();

    const brand: BrandRecord = {
      id: randomUUID(),
      name,
      domain:
        request.domain?.trim() ||
        undefined,
      fromEmail:
        request.fromEmail?.trim() ||
        undefined,
      emailSignature:
        request.emailSignature?.trim() ||
        undefined,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      brand,
    );
  }

  update(
    id: string,
    request: BrandRequest,
  ): BrandRecord {
    const existing =
      this.repository.get(id);

    if (!existing) {
      throw new Error(
        "Brand not found.",
      );
    }

    const updated: BrandRecord = {
      ...existing,
      name:
        request.name.trim() ||
        existing.name,
      domain:
        request.domain?.trim() ||
        undefined,
      fromEmail:
        request.fromEmail?.trim() ||
        undefined,
      emailSignature:
        request.emailSignature?.trim() ||
        undefined,
      updatedAt:
        new Date().toISOString(),
    };

    return this.repository.update(
      updated,
    );
  }

  get(
    id: string,
  ): BrandRecord | undefined {
    return this.repository.get(id);
  }

  list(): readonly BrandRecord[] {
    return this.repository.list();
  }

  delete(id: string): void {
    this.repository.delete(id);
  }
}
