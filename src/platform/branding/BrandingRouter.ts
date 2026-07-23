import {
  Router,
  type RequestHandler,
} from "express";

import { requireRole } from "../auth/requireRole";
import type { UpdateBrandingRequest } from "./OrganizationBranding";
import type { BrandingService } from "./BrandingService";

export interface BrandingRouterDependencies {
  branding: BrandingService;

  /**
   * Resolves the tenant from the subdomain/header for the public read.
   */
  tenantMiddleware: RequestHandler;

  /**
   * Authenticates the admin performing an update.
   */
  requireUser: RequestHandler;
}

/**
 * The white-label branding API.
 *
 * GET is public — a tenant's login screen needs its branding *before*
 * anyone signs in, so the tenant is taken from the subdomain. PUT is
 * restricted to owners and admins of the tenant.
 */
export function createBrandingRouter(
  deps: BrandingRouterDependencies,
): Router {
  const router = Router();

  router.get(
    "/branding",
    deps.tenantMiddleware,
    (_req, res, next) => {
      deps.branding
        .get()
        .then((branding) =>
          res.json({ branding }),
        )
        .catch(next);
    },
  );

  router.put(
    "/branding",
    deps.requireUser,
    requireRole("owner", "admin"),
    (req, res, next) => {
      deps.branding
        .update(
          (req.body ??
            {}) as UpdateBrandingRequest,
        )
        .then((branding) =>
          res.json({ branding }),
        )
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "";

          if (
            /hex color|valid email/i.test(
              message,
            )
          ) {
            res.status(400).json({
              error: {
                code: "INVALID_BRANDING",
                message,
              },
            });

            return;
          }

          next(error);
        });
    },
  );

  return router;
}
