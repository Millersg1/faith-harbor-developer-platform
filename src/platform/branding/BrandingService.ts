import { requireTenant } from "../../tenancy/TenantContext";
import {
  normalizeBranding,
  type OrganizationBrandingRecord,
  type UpdateBrandingRequest,
} from "./OrganizationBranding";
import { BrandingRepository } from "./BrandingRepository";

/**
 * Reads and writes the acting tenant's white-label branding. Reading a
 * tenant that has never set branding returns an empty record (all
 * defaults), so callers always get something to render.
 */
export class BrandingService {
  constructor(
    private readonly repository =
      new BrandingRepository(),
  ) {}

  async get(): Promise<OrganizationBrandingRecord> {
    const existing =
      await this.repository.get();

    if (existing) {
      return existing;
    }

    return {
      organizationId:
        requireTenant()
          .organizationId,
      updatedAt: "",
    };
  }

  /**
   * Applies a partial branding update. Only the fields present in the
   * request change; passing an empty string clears a field. Colors and
   * the support email are validated.
   */
  async update(
    changes: UpdateBrandingRequest,
  ): Promise<OrganizationBrandingRecord> {
    const cleaned =
      normalizeBranding(changes);

    const existing =
      await this.repository.get();

    return this.repository.upsert({
      displayName:
        existing?.displayName,
      logoUrl: existing?.logoUrl,
      faviconUrl:
        existing?.faviconUrl,
      primaryColor:
        existing?.primaryColor,
      secondaryColor:
        existing?.secondaryColor,
      accentColor:
        existing?.accentColor,
      loginMessage:
        existing?.loginMessage,
      supportEmail:
        existing?.supportEmail,
      ...cleaned,
      updatedAt:
        new Date().toISOString(),
    });
  }
}
