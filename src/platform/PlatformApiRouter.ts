import { Router } from "express";

import type { PlatformClientService } from "./clients/PlatformClientService";

export interface PlatformApiDependencies {
  clients: PlatformClientService;
}

/**
 * The tenant-scoped platform API. It is always mounted *behind* the
 * tenant middleware, so every handler runs inside an organization's
 * scope and the services it calls are automatically confined to that
 * tenant. No handler here ever mentions an organization id — isolation
 * is ambient.
 *
 * This starts with Clients as the demonstrator; the other tenant-scoped
 * entities plug in the same way.
 */
export function createPlatformApiRouter(
  deps: PlatformApiDependencies,
): Router {
  const router = Router();

  router.get(
    "/clients",
    (_req, res, next) => {
      deps.clients
        .list()
        .then((clients) =>
          res.json({ clients }),
        )
        .catch(next);
    },
  );

  router.post(
    "/clients",
    (req, res, next) => {
      const body = (req.body ??
        {}) as {
        name?: unknown;
        email?: unknown;
        company?: unknown;
      };

      if (
        typeof body.name !==
          "string" ||
        !body.name.trim()
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_CLIENT",
            message:
              "A client requires a name.",
          },
        });

        return;
      }

      deps.clients
        .create({
          name: body.name,
          email:
            typeof body.email ===
            "string"
              ? body.email
              : undefined,
          company:
            typeof body.company ===
            "string"
              ? body.company
              : undefined,
        })
        .then((client) =>
          res
            .status(201)
            .json({ client }),
        )
        .catch(next);
    },
  );

  return router;
}
