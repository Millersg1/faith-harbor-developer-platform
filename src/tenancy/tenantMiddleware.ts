import type {
  Request,
  RequestHandler,
} from "express";

import type { OrganizationService } from "./OrganizationService";
import { runWithTenant } from "./TenantContext";

export interface TenantMiddlewareOptions {
  /**
   * The platform's base domain (e.g. "allelitecloud.com"). When set, the
   * tenant is taken from the left-most label of the host
   * (`acme.allelitecloud.com` -> `acme`). Omit to resolve tenants only
   * from the explicit header (useful in tests and for API clients).
   */
  baseDomain?: string;
}

/**
 * Resolves the tenant for each request and runs the rest of the pipeline
 * inside that organization's scope.
 *
 * The tenant is taken from the `X-Org-Slug` header (explicit, for API
 * clients and tests) or from the request's subdomain under the platform
 * base domain. An unknown or inactive organization is rejected here, so
 * no handler ever runs for a tenant that shouldn't be served. Everything
 * downstream sees the tenant via the ambient context — the tenant-scoped
 * repositories pick it up automatically.
 */
export function createTenantMiddleware(
  organizations: OrganizationService,
  options: TenantMiddlewareOptions = {},
): RequestHandler {
  const baseDomain =
    options.baseDomain
      ?.trim()
      .toLowerCase();

  return (req, res, next) => {
    const slug = resolveSlug(
      req,
      baseDomain,
    );

    if (!slug) {
      res.status(400).json({
        error: {
          code: "NO_TENANT",
          message:
            "No organization was specified for this request.",
        },
      });

      return;
    }

    organizations
      .getBySlug(slug)
      .then((organization) => {
        if (!organization) {
          res.status(404).json({
            error: {
              code: "UNKNOWN_ORG",
              message:
                "Unknown organization.",
            },
          });

          return;
        }

        if (
          organization.status !==
          "active"
        ) {
          res.status(403).json({
            error: {
              code: "ORG_INACTIVE",
              message:
                "This organization is not active.",
            },
          });

          return;
        }

        // Everything from here runs inside the tenant's scope.
        runWithTenant(
          {
            organizationId:
              organization.id,
          },
          () => next(),
        );
      })
      .catch(next);
  };
}

/**
 * Extracts the tenant slug from the request: explicit header first, then
 * the host's subdomain when it sits under the configured base domain.
 */
function resolveSlug(
  req: Request,
  baseDomain: string | undefined,
): string | undefined {
  const header =
    req.headers["x-org-slug"];

  if (
    typeof header === "string" &&
    header.trim()
  ) {
    return header.trim().toLowerCase();
  }

  if (!baseDomain) {
    return undefined;
  }

  const host = (req.headers.host ?? "")
    .split(":")[0]
    .toLowerCase();

  const suffix = `.${baseDomain}`;

  if (
    !host.endsWith(suffix) ||
    host === baseDomain
  ) {
    return undefined;
  }

  const label = host
    .slice(
      0,
      host.length - suffix.length,
    )
    .split(".")
    .pop();

  if (
    !label ||
    label === "www" ||
    label === "app"
  ) {
    return undefined;
  }

  return label;
}
