import type {
  Request,
  RequestHandler,
} from "express";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { PortalSessionService } from "./PortalSessionService";

export const PORTAL_COOKIE =
  "aec_portal";

export interface PortalContext {
  clientUserId: string;
  clientId: string;
  organizationId: string;
}

export interface PortalRequest
  extends Request {
  portal?: PortalContext;
}

/** Reads the portal token from the aec_portal cookie or a Bearer header. */
export function readPortalToken(
  req: Request,
): string | undefined {
  const authHeader =
    req.headers.authorization;

  if (
    authHeader?.startsWith("Bearer ")
  ) {
    const value = authHeader
      .slice(7)
      .trim();

    if (value) {
      return value;
    }
  }

  const cookieHeader =
    req.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(
    ";",
  )) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    if (
      part.slice(0, index).trim() ===
      PORTAL_COOKIE
    ) {
      return decodeURIComponent(
        part
          .slice(index + 1)
          .trim(),
      );
    }
  }

  return undefined;
}

/**
 * Guards portal routes: validates the session, then runs the handler inside
 * the session's organization scope with the client attached. So every portal
 * request is correctly scoped to the client's own organization and client id.
 */
export function createRequirePortalUser(
  sessions: PortalSessionService,
): RequestHandler {
  return (req, res, next) => {
    const token =
      readPortalToken(req);

    if (!token) {
      unauthorized(res);
      return;
    }

    sessions
      .validate(token)
      .then((session) => {
        if (!session) {
          unauthorized(res);
          return;
        }

        runWithTenant(
          {
            organizationId:
              session.organizationId,
          },
          () => {
            (
              req as PortalRequest
            ).portal = {
              clientUserId:
                session.clientUserId,
              clientId:
                session.clientId,
              organizationId:
                session.organizationId,
            };

            next();
          },
        );
      })
      .catch(next);
  };
}

function unauthorized(
  res: Parameters<RequestHandler>[1],
): void {
  res.status(401).json({
    error: {
      code: "UNAUTHENTICATED",
      message:
        "Sign in to the portal to continue.",
    },
  });
}
