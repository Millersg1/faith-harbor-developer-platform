import { randomUUID } from "node:crypto";

import type {
  CreatePlatformBrandRequest,
  PlatformBrandRecord,
  UpdatePlatformBrandRequest,
} from "./PlatformBrand";
import { PlatformBrandRepository } from "./PlatformBrandRepository";

/**
 * Manages the acting tenant's brands. Everything is tenant-scoped through the
 * repository, so a tenant only ever touches its own brands.
 */
export class PlatformBrandService {
  constructor(
    private readonly repository =
      new PlatformBrandRepository(),
  ) {}

  async create(
    request: CreatePlatformBrandRequest,
  ): Promise<PlatformBrandRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A brand needs a name.",
      );
    }

    const now =
      new Date().toISOString();

    return this.repository.create({
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
    });
  }

  async get(
    id: string,
  ): Promise<PlatformBrandRecord> {
    const brand =
      await this.repository.get(id);

    if (!brand) {
      throw new Error(
        "Brand not found.",
      );
    }

    return brand;
  }

  async list(): Promise<
    readonly PlatformBrandRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformBrandRequest,
  ): Promise<PlatformBrandRecord> {
    const existing =
      await this.get(id);

    const updated: PlatformBrandRecord =
      {
        ...existing,
        name:
          changes.name?.trim() ||
          existing.name,
        domain: text(
          changes.domain,
          existing.domain,
        ),
        fromEmail: text(
          changes.fromEmail,
          existing.fromEmail,
        ),
        emailSignature: text(
          changes.emailSignature,
          existing.emailSignature,
        ),
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.repository.delete(id);
  }
}

function text(
  change: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (change === undefined) {
    return existing;
  }

  return change.trim() || undefined;
}
