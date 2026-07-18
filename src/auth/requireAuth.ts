import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { AuthService } from "./AuthService";
import {
  readCookie,
  SESSION_COOKIE,
} from "./cookies";

/**
 * Express middleware that rejects requests without a valid session.
 */
export function requireAuth(
  authService: AuthService,
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const token = readCookie(
      req,
      SESSION_COOKIE,
    );

    if (
      authService.isValidSession(
        token,
      )
    ) {
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message:
          "Authentication is required.",
      },
    });
  };
}
