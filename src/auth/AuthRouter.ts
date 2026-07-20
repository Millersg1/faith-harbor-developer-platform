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

  totpCode: z
    .string()
    .trim()
    .optional(),
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

      // Second factor, when enabled.
      if (
        authService.is2faEnabled()
      ) {
        const code =
          parsed.data.totpCode;

        if (!code) {
          res.status(401).json({
            authenticated: false,
            error: {
              code:
                "TOTP_REQUIRED",
              message:
                "Enter the code from your authenticator app.",
            },
          });

          return;
        }

        if (
          !authService.verifyTotpCode(
            code,
          )
        ) {
          authService.recordFailedAttempt(
            key,
          );

          res.status(401).json({
            authenticated: false,
            error: {
              code: "INVALID_TOTP",
              message:
                "That authenticator code is not valid.",
            },
          });

          return;
        }
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
          twoFactorEnabled:
            authService.is2faEnabled(),
        });

        return;
      }

      res.status(401).json({
        authenticated: false,
      });
    },
  );

  /**
   * Returns true and pins nothing when the request carries a valid
   * admin session; otherwise sends 401 and returns false.
   */
  const requireSession = (
    req: import("express").Request,
    res: import("express").Response,
  ): boolean => {
    const token = readCookie(
      req,
      SESSION_COOKIE,
    );

    if (
      authService.isValidSession(
        token,
      )
    ) {
      return true;
    }

    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message:
          "Authentication is required.",
      },
    });

    return false;
  };

  router.post(
    "/change-password",
    (req, res) => {
      if (
        !requireSession(req, res)
      ) {
        return;
      }

      const body = req.body as {
        currentPassword?: unknown;
        newPassword?: unknown;
      };

      if (
        typeof body.currentPassword !==
          "string" ||
        typeof body.newPassword !==
          "string"
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message:
              "Current and new passwords are required.",
          },
        });

        return;
      }

      try {
        authService.changePassword(
          body.currentPassword,
          body.newPassword,
        );

        res.json({
          success: true,
        });
      } catch (error) {
        res.status(400).json({
          error: {
            code:
              "PASSWORD_CHANGE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Password change failed.",
          },
        });
      }
    },
  );

  router.post(
    "/2fa/setup",
    (req, res) => {
      if (
        !requireSession(req, res)
      ) {
        return;
      }

      try {
        res.json(
          authService.beginTotpSetup(),
        );
      } catch (error) {
        res.status(400).json({
          error: {
            code: "2FA_SETUP_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Could not start 2FA setup.",
          },
        });
      }
    },
  );

  router.post(
    "/2fa/enable",
    (req, res) => {
      if (
        !requireSession(req, res)
      ) {
        return;
      }

      const code = (
        req.body as {
          code?: unknown;
        }
      ).code;

      if (
        typeof code !== "string"
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_REQUEST",
            message:
              "A code is required.",
          },
        });

        return;
      }

      try {
        authService.enableTotp(code);

        res.json({
          success: true,
          twoFactorEnabled: true,
        });
      } catch (error) {
        res.status(400).json({
          error: {
            code: "2FA_ENABLE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Could not enable 2FA.",
          },
        });
      }
    },
  );

  router.post(
    "/2fa/disable",
    (req, res) => {
      if (
        !requireSession(req, res)
      ) {
        return;
      }

      authService.disableTotp();

      res.json({
        success: true,
        twoFactorEnabled: false,
      });
    },
  );

  return router;
}
