import type {
  Request,
  RequestHandler,
} from "express";

import {
  toPublicAdmin,
  type PublicPlatformAdmin,
} from "./PlatformAdmin";
import type { PlatformAdminService } from "./PlatformAdminService";
import type { PlatformAdminSessionService } from "./PlatformAdminSessionService";

export const ADMIN_COOKIE =
  "aec_admin";

export interface AdminedRequest
  extends Request {
  admin?: PublicPlatformAdmin;
}

/**
 * Guards the platform-admin console. Validates the admin session (from
 * the admin cookie or a Bearer token) and attaches the admin. There is
 * no tenant scope here — an admin acts across all organizations.
 */
export function createRequirePlatformAdmin(deps: {
  adminSessions: PlatformAdminSessionService;
  admins: PlatformAdminService;
}): RequestHandler {
  return (req, res, next) => {
    const token = readAdminToken(req);

    if (!token) {
      deny(res);
      return;
    }

    deps.adminSessions
      .validate(token)
      .then((session) => {
        if (!session) {
          deny(res);
          return;
        }

        deps.admins
          .get(session.adminId)
          .then((admin) => {
            (
              req as AdminedRequest
            ).admin =
              toPublicAdmin(admin);
            next();
          })
          .catch(() => deny(res));
      })
      .catch(next);
  };
}

function deny(
  res: Parameters<RequestHandler>[1],
): void {
  res.status(401).json({
    error: {
      code: "ADMIN_UNAUTHENTICATED",
      message:
        "Platform admin sign-in required.",
    },
  });
}

export function readAdminToken(
  req: Request,
): string | undefined {
  const auth =
    req.headers.authorization;

  if (auth?.startsWith("Bearer ")) {
    const v = auth.slice(7).trim();
    if (v) {
      return v;
    }
  }

  const cookie = req.headers.cookie;

  if (!cookie) {
    return undefined;
  }

  for (const part of cookie.split(
    ";",
  )) {
    const i = part.indexOf("=");
    if (i === -1) {
      continue;
    }
    if (
      part.slice(0, i).trim() ===
      ADMIN_COOKIE
    ) {
      return decodeURIComponent(
        part.slice(i + 1).trim(),
      );
    }
  }

  return undefined;
}
