import { runWithTenant } from "../../tenancy/TenantContext";
import type { OrganizationRecord } from "../../tenancy/Organization";
import type { OrganizationService } from "../../tenancy/OrganizationService";
import {
  toPublicUser,
  type PublicPlatformUser,
} from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { PlatformSessionRecord } from "../sessions/PlatformSession";
import type { PlatformSessionService } from "../sessions/PlatformSessionService";

export interface SignupRequest {
  organizationName: string;
  slug?: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerName?: string;
}

export interface SignupResult {
  organization: OrganizationRecord;
  owner: PublicPlatformUser;
  session?: PlatformSessionRecord;
}

/**
 * Onboards a brand-new organization and its first user in one step.
 *
 * The order matters for safety: owner credentials are validated *before*
 * the organization is created, and if creating the owner still fails, the
 * just-created organization is rolled back — so a failed signup never
 * leaves an empty tenant behind. When a session service is provided, the
 * new owner is logged in immediately.
 */
export class PlatformSignupService {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly users: PlatformUserService,
    private readonly sessions?: PlatformSessionService,
  ) {}

  async signup(
    request: SignupRequest,
  ): Promise<SignupResult> {
    const email =
      request.ownerEmail
        ?.trim()
        .toLowerCase() ?? "";

    // Validate the owner up front so we don't create an org we then
    // can't attach an owner to.
    if (!email.includes("@")) {
      throw new Error(
        "A valid owner email is required.",
      );
    }

    if (
      !request.ownerPassword ||
      request.ownerPassword.length < 8
    ) {
      throw new Error(
        "Owner password must be at least 8 characters.",
      );
    }

    // Create the organization (throws on a duplicate slug).
    const organization =
      await this.organizations.create({
        name: request.organizationName,
        slug: request.slug,
      });

    try {
      const owner =
        await runWithTenant(
          {
            organizationId:
              organization.id,
          },
          () =>
            this.users.create({
              email,
              password:
                request.ownerPassword,
              name: request.ownerName,
              role: "owner",
            }),
        );

      const session = this.sessions
        ? await this.sessions.createForUser(
            owner,
          )
        : undefined;

      const result: SignupResult = {
        organization,
        owner: toPublicUser(owner),
      };

      if (session) {
        result.session = session;
      }

      return result;
    } catch (error) {
      // Roll back the empty organization so a failed signup leaves
      // nothing behind.
      await this.organizations
        .delete(organization.id)
        .catch(() => {
          // Best-effort cleanup; surface the original error below.
        });

      throw error;
    }
  }
}
