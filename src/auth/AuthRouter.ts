import { Router } from "express";
import { z } from "zod";

import { config } from "../config";

import { AuthService } from "./AuthService";
import {
  readCookie,
  SESSION_COOKIE,
} from "./cookies";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1),

  password: z
    .string()
    .min(1),
});

/**
 * Creates the authentication routes: login, logout, and session
 * status. These routes are public; everything else is gated.
 */
export function createAuthRouter(
  authService: AuthService,
): Router {
  const router = Router();

  const secureCookie =
    config.NODE_ENV ===
    "production";

  router.post(
    "/login",
    (req, res) => {
      const key = req.ip ?? "unknown";

      if (
        !authService.isLoginAllowed(
          key,
        )
      ) {
        res.status(429).json({
          error: {
            code:
              "TOO_MANY_ATTEMPTS",
            message:
              "Too many login attempts. Try again later.",
          },
        });

        return;
      }

      const parsed =
        loginSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        authService.recordFailedAttempt(
          key,
        );

        res.status(400).json({
          error: {
            code:
              "INVALID_LOGIN_REQUEST",
            message:
              "Email and password are required.",
          },
        });

        return;
      }

      const valid =
        authService.verifyCredentials(
          parsed.data.email,
          parsed.data.password,
        );

      if (!valid) {
        authService.recordFailedAttempt(
          key,
        );

        res.status(401).json({
          authenticated: false,
          error: {
            code:
              "INVALID_CREDENTIALS",
            message:
              "The email or password is incorrect.",
          },
        });

        return;
      }

      authService.clearAttempts(key);

      const token =
        authService.createSession();

      res.cookie(
        SESSION_COOKIE,
        token,
        {
          httpOnly: true,
          sameSite: "strict",
          secure: secureCookie,
          path: "/",
          maxAge:
            authService.sessionMaxAgeMs,
        },
      );

      res.json({
        authenticated: true,
        user: {
          email:
            authService.adminEmail,
        },
      });
    },
  );

  router.post(
    "/logout",
    (req, res) => {
      const token = readCookie(
        req,
        SESSION_COOKIE,
      );

      authService.destroySession(
        token,
      );

      res.clearCookie(
        SESSION_COOKIE,
        {
          httpOnly: true,
          sameSite: "strict",
          secure: secureCookie,
          path: "/",
        },
      );

      res.json({
        authenticated: false,
      });
    },
  );

  router.get(
    "/me",
    (req, res) => {
      const token = readCookie(
        req,
        SESSION_COOKIE,
      );

      if (
        authService.isValidSession(
          token,
        )
      ) {
        res.json({
          authenticated: true,
          user: {
            email:
              authService.adminEmail,
          },
        });

        return;
      }

      res.status(401).json({
        authenticated: false,
      });
    },
  );

  return router;
}
