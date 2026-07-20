import { randomBytes } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { ClientUserService } from "./ClientUserService";
import { toPublicClientUser } from "./ClientUser";

const createSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1),
  email: z.string().trim().min(1),
  // Optional: when omitted, the server generates a strong password
  // with a CSPRNG and returns it once.
  password: z
    .string()
    .min(8)
    .optional(),
});

/**
 * Generates a strong temporary password with a cryptographically
 * secure RNG (unambiguous alphabet, no look-alike characters).
 */
function generatePassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  const bytes = randomBytes(18);

  return (
    "FH-" +
    Array.from(
      bytes,
      (b) =>
        alphabet[b % alphabet.length],
    ).join("")
  );
}

/**
 * Administrator routes to manage client portal logins. Mounted behind
 * the admin auth gate.
 */
export function createClientUserAdminRouter(
  clientUsers: ClientUserService,
): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId
        : "";

    if (!clientId) {
      res.status(400).json({
        error: {
          code:
            "CLIENT_ID_REQUIRED",
          message:
            "A clientId query parameter is required.",
        },
      });

      return;
    }

    const users =
      clientUsers
        .listForClient(clientId)
        .map(toPublicClientUser);

    res.json({
      count: users.length,
      users,
    });
  });

  router.post(
    "/",
    (req, res, next) => {
      const parsed =
        createSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_USER",
            message:
              "clientId, email, and an 8+ character password are required.",
          },
        });

        return;
      }

      // The server mints the password when the admin doesn't supply
      // one, so credentials are never generated in the browser.
      const generated =
        !parsed.data.password;

      const password =
        parsed.data.password ??
        generatePassword();

      try {
        const user =
          clientUsers.createUser({
            clientId:
              parsed.data.clientId,
            email:
              parsed.data.email,
            password,
          });

        res.status(201).json({
          ...toPublicClientUser(
            user,
          ),
          ...(generated
            ? {
                temporaryPassword:
                  password,
              }
            : {}),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "";

        if (
          message.includes(
            "already exists",
          )
        ) {
          res.status(409).json({
            error: {
              code:
                "EMAIL_TAKEN",
              message,
            },
          });

          return;
        }

        if (
          message.includes(
            "not found",
          ) ||
          message.includes(
            "required",
          ) ||
          message.includes(
            "at least",
          )
        ) {
          res.status(400).json({
            error: {
              code:
                "INVALID_USER",
              message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  return router;
}
