import { Router } from "express";
import { z } from "zod";

import { EmailService } from "./EmailService";

const emailRequestSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1),

  subject: z
    .string()
    .trim()
    .min(1),

  body: z
    .string()
    .trim()
    .min(1),

  from: z
    .string()
    .trim()
    .optional(),

  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

/**
 * Creates the communications (email) routes.
 */
export function createEmailRouter(
  emailService: EmailService,
): Router {
  const router = Router();

  /**
   * Returns the outbox.
   */
  router.get("/", (_req, res) => {
    const emails =
      emailService.list();

    res.json({
      count: emails.length,
      emails,
    });
  });

  /**
   * Sends (or logs) an email.
   */
  router.post(
    "/",
    (req, res, next) => {
      const parsed =
        emailRequestSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_EMAIL_REQUEST",
            message:
              "Email request validation failed.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      emailService
        .send(parsed.data)
        .then((email) => {
          res.status(201).json({
            success: true,
            status: email.status,
            email,
          });
        })
        .catch(next);
    },
  );

  return router;
}
