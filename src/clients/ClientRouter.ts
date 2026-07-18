import { Router } from "express";
import { z } from "zod";

import type { ProjectService } from "../projects/ProjectService";
import type { ProposalRecord } from "../proposals/ProposalRecord";
import type { ProposalService } from "../proposals/ProposalService";
import { ClientService } from "./ClientService";

const createClientSchema =
  z.object({
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
  client:
    ReturnType<
      ClientService["get"]
    >;

  proposals:
    readonly ProposalRecord[];
}

/**
 * Creates client-management routes.
 */
export function createClientRouter(
  clientService: ClientService,
  proposalService?:
    ProposalService,
  projectService?:
    ProjectService,
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

  router.get(
    "/:clientId",
    (req, res) => {
      try {
        const client =
          clientService.get(
            req.params.clientId,
          );

        res.json(client);
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "CLIENT_NOT_FOUND",

            message:
              error instanceof Error
                ? error.message
                : "Client not found.",
          },
        });
      }
    },
  );

  router.get(
    "/:clientId/workspace",
    (req, res) => {
      try {
        const client =
          clientService.get(
            req.params.clientId,
          );

        const workspace:
          ClientWorkspace = {
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
            code:
              "CLIENT_NOT_FOUND",

            message:
              error instanceof Error
                ? error.message
                : "Client not found.",
          },
        });
      }
    },
  );

  router.post(
    "/",
    (req, res) => {
      const parsed =
        createClientSchema
          .safeParse(
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

      res.status(201).json(
        client,
      );
    },
  );

  /**
   * Permanently deletes one client only when no proposals
   * or projects are attached.
   */
  router.delete(
    "/:clientId",
    (req, res, next) => {
      try {
        const client =
          clientService.get(
            req.params.clientId,
          );

        const proposals =
          proposalService
            ?.listForClient(
              client.id,
            ) ?? [];

        const projects =
          projectService
            ?.listForClient(
              client.id,
            ) ?? [];

        if (
          proposals.length > 0 ||
          projects.length > 0
        ) {
          res.status(409).json({
            error: {
              code:
                "CLIENT_HAS_RELATED_RECORDS",

              message:
                `Client "${client.companyName}" cannot be deleted while related proposals or projects exist.`,

              details: {
                proposalCount:
                  proposals.length,

                projectCount:
                  projects.length,
              },
            },
          });

          return;
        }

        clientService.delete(
          client.id,
        );

        res.status(204).send();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "was not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "CLIENT_NOT_FOUND",

              message:
                error.message,
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