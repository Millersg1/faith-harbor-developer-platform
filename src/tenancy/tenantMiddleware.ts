import type {
  Request,
  RequestHandler,
  Response,
} from "express";

import type { OrganizationRecord } from "./Organization";
import type { OrganizationService } from "./OrganizationService";
import { runWithTenant } from "./TenantContext";

/**
 * Resolves an incoming host to the organization id that owns it (custom
 * white-label domains). Global — no tenant context.
 */
export interface DomainResolver {
  resolve(
    host: string,
  ): Promise<string | undefined>;
}

export interface TenantMiddlewareOptions {
  /**
   * The platform's base domain (e.g. "allelitecloud.com"). When set, the
   * tenant is taken from the left-most label of the host under it.
   */
  baseDomain?: string;

  /**
   * Custom-domain resolver. When set, a request whose host isn't a
   * platform subdomain is matched against registered white-label domains,
   * so a Platform Partner can run on their own domain.
   */
  domains?: DomainResolver;
}

/**
 * Resolves the tenant for each request and runs the rest of the pipeline
 * inside that organization's scope.
 *
 * Resolution order: explicit `X-Org-Slug` header, then a subdomain under
 * the platform base domain, then a registered custom domain matching the
 * request host. An unknown or inactive organization is rejected here.
 */
export function createTenantMiddleware(
  organizations: OrganizationService,
  options: TenantMiddlewareOptions = {},
): RequestHandler {
  const baseDomain =
    options.baseDomain
      ?.trim()
      .toLowerCase();
  const domains = options.domains;

  return (req, res, next) => {
    const slug = resolveSlug(
      req,
      baseDomain,
    );

    if (slug) {
      organizations
        .getBySlug(slug)
        .then((org) =>
          finish(org, res, next),
        )
        .catch(next);

      return;
    }

    // No slug — try a registered custom domain by host.
    const host = hostOf(req);

    if (domains && host) {
      domains
        .resolve(host)
        .then((organizationId) => {
          if (!organizationId) {
            noTenant(res);
            return;
          }

          organizations
            .get(organizationId)
            .then((org) =>
              finish(
                org,
                res,
                next,
              ),
            )
            .catch(() =>
              noTenant(res),
            );
        })
        .catch(next);

      return;
    }

    noTenant(res);
  };
}

/**
 * Applies the standard checks for a resolved organization and, if it
 * passes, runs the rest of the request inside its scope.
 */
function finish(
  organization:
    | OrganizationRecord
    | undefined,
  res: Response,
  next: Parameters<RequestHandler>[2],
): void {
  if (!organization) {
    res.status(404).json({
      error: {
        code: "UNKNOWN_ORG",
        message: "Unknown organization.",
      },
    });

    return;
  }

  if (
    organization.status !== "active"
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

  runWithTenant(
    {
      organizationId:
        organization.id,
    },
    () => next(),
  );
}

function noTenant(
  res: Response,
): void {
  res.status(400).json({
    error: {
      code: "NO_TENANT",
      message:
        "No organization was specified for this request.",
    },
  });
}

function hostOf(
  req: Request,
): string {
  return (req.headers.host ?? "")
    .split(":")[0]
    .toLowerCase();
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

  const host = hostOf(req);
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
