import { randomUUID } from "node:crypto";

import { defaultHostingPlans } from "./defaultHostingPlans";
import { HostingPlanRepository } from "./HostingPlanRepository";
import type {
  HostingPlanRecord,
  HostingPlanRequest,
} from "./HostingPlanTypes";

/**
 * Manages the hosting plan catalog customers order from.
 */
export class HostingPlanService {
  constructor(
    private readonly repository =
      new HostingPlanRepository(),
  ) {}

  /**
   * Seeds the standard catalog on first run. Does nothing when plans
   * already exist, so an operator's edits are never overwritten.
   */
  seedDefaults(): void {
    if (this.repository.list().length > 0) {
      return;
    }

    for (const plan of defaultHostingPlans) {
      this.create(plan);
    }
  }

  create(
    request: HostingPlanRequest,
  ): HostingPlanRecord {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A hosting plan requires a name.",
      );
    }

    if (request.priceMonthlyCents < 0) {
      throw new Error(
        "A hosting plan price cannot be negative.",
      );
    }

    const now =
      new Date().toISOString();

    const slug =
      request.slug?.trim() ||
      this.slugify(name);

    const plan: HostingPlanRecord = {
      id: randomUUID(),
      kind: request.kind ?? "shared",
      name,
      slug,
      priceMonthlyCents:
        request.priceMonthlyCents,
      priceYearlyCents:
        request.priceYearlyCents ??
        // Default to 20% off the 12-month total.
        Math.round(
          request.priceMonthlyCents *
            12 *
            0.8,
        ),
      specs: request.specs,
      features:
        request.features ?? [],
      popular:
        request.popular ?? false,
      active: request.active ?? true,
      sortOrder:
        request.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    if (request.description?.trim()) {
      plan.description =
        request.description.trim();
    }

    if (request.whmPackage?.trim()) {
      plan.whmPackage =
        request.whmPackage.trim();
    }

    return this.repository.create(plan);
  }

  update(
    id: string,
    request: HostingPlanRequest,
  ): HostingPlanRecord {
    const existing =
      this.repository.get(id);

    if (!existing) {
      throw new Error(
        `Hosting plan "${id}" was not found.`,
      );
    }

    const updated: HostingPlanRecord = {
      ...existing,
      kind:
        request.kind ?? existing.kind,
      name:
        request.name.trim() ||
        existing.name,
      slug:
        request.slug?.trim() ||
        existing.slug,
      priceMonthlyCents:
        request.priceMonthlyCents,
      priceYearlyCents:
        request.priceYearlyCents ??
        existing.priceYearlyCents,
      specs: request.specs,
      features:
        request.features ??
        existing.features,
      description:
        request.description?.trim() ||
        undefined,
      whmPackage:
        request.whmPackage?.trim() ||
        undefined,
      popular:
        request.popular ??
        existing.popular,
      active:
        request.active ??
        existing.active,
      sortOrder:
        request.sortOrder ??
        existing.sortOrder,
      updatedAt:
        new Date().toISOString(),
    };

    return this.repository.update(
      updated,
    );
  }

  get(
    id: string,
  ): HostingPlanRecord | undefined {
    return this.repository.get(id);
  }

  getBySlug(
    slug: string,
  ): HostingPlanRecord | undefined {
    return this.repository.getBySlug(
      slug,
    );
  }

  /**
   * All plans (for admin management).
   */
  list(): readonly HostingPlanRecord[] {
    return this.repository.list();
  }

  /**
   * Only the active plans (for the public storefront).
   */
  listActive(): readonly HostingPlanRecord[] {
    return this.repository
      .list()
      .filter((plan) => plan.active);
  }

  delete(id: string): void {
    this.repository.delete(id);
  }

  private slugify(
    name: string,
  ): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
