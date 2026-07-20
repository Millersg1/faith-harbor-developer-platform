import { Router } from "express";
import { z } from "zod";

import { ApiKeyService } from "./ApiKeyService";

const createSchema = z.object({
  name: z.string().trim().min(1),
  brandId: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

/**
 * Admin-only management of SaaS Surface API keys. Creating a key
 * returns the raw key once; only its hash is stored.
 */
export function createApiKeyAdminRouter(
  apiKeys: ApiKeyService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const keys = apiKeys.list();

    res.json({
      count: keys.length,
      apiKeys: keys,
    });
  });

  router.post("/", (req, res) => {
    const parsed =
      createSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_API_KEY",
          message:
            "An API key requires a name.",
          details:
            parsed.error.flatten(),
        },
      });

      return;
    }

    const created =
      apiKeys.createKey(parsed.data);

    // The raw key is returned exactly once, here.
    res.status(201).json(created);
  });

  router.delete(
    "/:id",
    (req, res) => {
      apiKeys.delete(req.params.id);

      res.status(204).send();
    },
  );

  return router;
}
