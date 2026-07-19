import { basename } from "node:path";

import { Router } from "express";

import type { BackupService } from "./BackupService";

/**
 * Creates the backup routes.
 *
 * When no database is configured (for example under test) the service
 * is absent and the routes report backups as unavailable rather than
 * failing.
 */
export function createBackupRouter(
  backupService?: BackupService,
): Router {
  const router = Router();

  router.get(
    "/backups",
    (_req, res) => {
      if (!backupService) {
        res.json({
          available: false,
          count: 0,
          backups: [],
        });

        return;
      }

      const backups =
        backupService
          .list()
          .map((info) => ({
            name: basename(
              info.file,
            ),
            createdAt:
              info.createdAt,
            sizeBytes:
              info.sizeBytes,
          }));

      res.json({
        available: true,
        count: backups.length,
        backups,
      });
    },
  );

  router.post(
    "/backups",
    (_req, res, next) => {
      if (!backupService) {
        res.status(503).json({
          error: {
            code:
              "BACKUPS_UNAVAILABLE",
            message:
              "Backups require a database. None is configured.",
          },
        });

        return;
      }

      try {
        const info =
          backupService.runBackup();

        res.status(201).json({
          success: true,
          backup: {
            name: basename(
              info.file,
            ),
            createdAt:
              info.createdAt,
            sizeBytes:
              info.sizeBytes,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
