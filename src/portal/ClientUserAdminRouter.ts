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
  password: z.string().min(8),
});

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

      try {
        const user =
          clientUsers.createUser(
            parsed.data,
          );

        res.status(201).json(
          toPublicClientUser(user),
        );
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
