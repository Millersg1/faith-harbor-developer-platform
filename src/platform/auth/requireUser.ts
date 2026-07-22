import type {
  Request,
  RequestHandler,
} from "express";

import { runWithTenant } from "../../tenancy/TenantContext";
import {
  toPublicUser,
  type PublicPlatformUser,
} from "../users/PlatformUser";
import type { PlatformUserService } from "../users/PlatformUserService";
import type { PlatformSessionRecord } from "../sessions/PlatformSession";
import type { PlatformSessionService } from "../sessions/PlatformSessionService";

export const SESSION_COOKIE =
  "aec_session";

/**
 * The authenticated principal attached to a request by requireUser.
 */
export interface AuthContext {
  user: PublicPlatformUser;
  session: PlatformSessionRecord;
}

export interface AuthedRequest
  extends Request {
  auth?: AuthContext;
}

export interface RequireUserDependencies {
  sessions: PlatformSessionService;
  users: PlatformUserService;
}

/**
 * Guards routes that require a logged-in user.
 *
 * It validates the session token (from the session cookie or an
 * Authorization: Bearer header), then re-establishes the tenant from the
 * session and loads the user *within that tenant's scope* — so an
 * authenticated request is always correctly scoped to the user's own
 * organization, and the user lookup itself can't cross tenants.
 */
export function createRequireUser(
  deps: RequireUserDependencies,
): RequestHandler {
  return (req, res, next) => {
    const token = readToken(req);

    if (!token) {
      unauthorized(res);
      return;
    }

    deps.sessions
      .validate(token)
      .then((session) => {
        if (!session) {
          unauthorized(res);
          return;
        }

        // Everything below runs inside the session's organization.
        runWithTenant(
          {
            organizationId:
              session.organizationId,
          },
          () => {
            deps.users
              .get(session.userId)
              .then((user) => {
                (
                  req as AuthedRequest
                ).auth = {
                  user:
                    toPublicUser(user),
                  session,
                };

                next();
              })
              .catch(() => {
                // The user was removed but the session lingered.
                unauthorized(res);
              });
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
        "You must be signed in to do that.",
    },
  });
}

/**
 * Reads the session token from an Authorization: Bearer header or the
 * session cookie (parsed from the raw header, so no cookie-parser
 * dependency is needed).
 */
export function readToken(
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
    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part
      .slice(0, index)
      .trim();

    if (key === SESSION_COOKIE) {
      return decodeURIComponent(
        part.slice(index + 1).trim(),
      );
    }
  }

  return undefined;
}
