import { Router } from "express";
import { z } from "zod";

import { ClientService } from "./ClientService";
import type { ProposalRecord } from "../proposals/ProposalRecord";
import type { ProposalService } from "../proposals/ProposalService";

const createClientSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1),

  primaryContact: z
    .string()
    .trim()
    .min(1),

  email: z
    .string()
    .trim()
    .email()
    .optional(),

  phone: z
    .string()
    .trim()
    .min(1)
    .optional(),

  website: z
    .string()
    .trim()
    .url()
    .optional(),

  industry: z
    .string()
    .trim()
    .min(1)
    .optional(),

  notes: z
    .string()
    .trim()
    .min(1)
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

interface ClientWorkspace {
  client: ReturnType<ClientService["get"]>;
  proposals: readonly ProposalRecord[];
}

/**
 * Creates client-management routes.
 */
export function createClientRouter(
  clientService: ClientService,
  proposalService?: ProposalService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const clients =
      clientService.list();

    res.json({
      count: clients.length,
      clients,
    });
  });

  router.get("/:clientId", (req, res) => {
    try {
      const client =
        clientService.get(
          req.params.clientId,
        );

      res.json(client);
    } catch (error) {
      res.status(404).json({
        error: {
          code: "CLIENT_NOT_FOUND",
          message:
            error instanceof Error
              ? error.message
              : "Client not found.",
        },
      });
    }
  });

  router.get(
    "/:clientId/workspace",
    (req, res) => {
      try {
        const client =
          clientService.get(
            req.params.clientId,
          );

        const workspace: ClientWorkspace = {
          client,
          proposals:
            proposalService
              ?.listForClient(
                client.id,
              ) ?? [],
        };

        res.json(workspace);
      } catch (error) {
        res.status(404).json({
          error: {
            code: "CLIENT_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Client not found.",
          },
        });
      }
    },
  );

  router.post("/", (req, res) => {
    const parsed =
      createClientSchema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code:
            "INVALID_CLIENT_REQUEST",
          message:
            "Client validation failed.",
          details:
            parsed.error.flatten(),
        },
      });

      return;
    }

    const client =
      clientService.create(
        parsed.data,
      );

    res.status(201).json(client);
  });

  return router;
}