import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  PORTAL_COOKIE,
  readCookie,
} from "../auth/cookies";

import { PortalAuthService } from "./PortalAuthService";

/**
 * The request, extended with the authenticated client's id.
 */
export interface PortalRequest
  extends Request {
  portalClientId?: string;
}

/**
 * Rejects portal requests without a valid client session, and pins
 * the resolved clientId onto the request so handlers can only ever
 * act on that client's data.
 */
export function requirePortalAuth(
  portalAuth: PortalAuthService,
) {
  return (
    req: PortalRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    const token = readCookie(
      req,
      PORTAL_COOKIE,
    );

    const clientId =
      portalAuth.getClientId(token);

    if (!clientId) {
      res.status(401).json({
        error: {
          code:
            "PORTAL_UNAUTHENTICATED",
          message:
            "Please sign in to the client portal.",
        },
      });

      return;
    }

    req.portalClientId = clientId;

    next();
  };
}
