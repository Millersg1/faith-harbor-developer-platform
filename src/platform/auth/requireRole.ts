import type { RequestHandler } from "express";

import type { PlatformUserRole } from "../users/PlatformUser";
import type { AuthedRequest } from "./requireUser";

/**
 * Restricts a route to users holding one of the given roles.
 *
 * Must be mounted *after* requireUser (which attaches the authenticated
 * user). Responds 401 if somehow unauthenticated, 403 if authenticated
 * but lacking the role — so privilege checks never fall through.
 */
export function requireRole(
  ...roles: PlatformUserRole[]
): RequestHandler {
  return (req, res, next) => {
    const auth = (
      req as AuthedRequest
    ).auth;

    if (!auth) {
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message:
            "You must be signed in to do that.",
        },
      });

      return;
    }

    if (
      !roles.includes(auth.user.role)
    ) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message:
            "You do not have permission to do that.",
        },
      });

      return;
    }

    next();
  };
}
