import "dotenv/config";

import { PostgresDatabase } from "../persistence/PostgresDatabase";
import { OrganizationRepository } from "../tenancy/OrganizationRepository";
import { OrganizationService } from "../tenancy/OrganizationService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

/**
 * Boots the All Elite Cloud platform against Postgres and starts serving.
 *
 * Runs as its own process, separate from the legacy Faith Harbor OS
 * server — so standing this up never touches production. It reads its
 * Postgres connection and settings from the environment.
 */
async function start(): Promise<void> {
  const user = process.env.PG_USER;
  const password =
    process.env.PG_PASSWORD;
  const database =
    process.env.PG_DATABASE;

  if (!user || !password || !database) {
    throw new Error(
      "The platform requires PG_USER, PG_PASSWORD and PG_DATABASE.",
    );
  }

  const db = new PostgresDatabase({
    host:
      process.env.PG_HOST ??
      "127.0.0.1",
    port: Number(
      process.env.PG_PORT ?? 5432,
    ),
    user,
    password,
    database,
  });

  await db.initialize();
  console.log(
    "All Elite Cloud schema ready.",
  );

  const organizations =
    new OrganizationService(
      new OrganizationRepository(db),
    );
  const users =
    new PlatformUserService(
      new PlatformUserRepository(db),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(
        db,
      ),
    );
  const branding =
    new BrandingService(
      new BrandingRepository(db),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(
        db,
      ),
    );
  const projects =
    new PlatformProjectService(
      new PlatformProjectRepository(
        db,
      ),
      clients,
    );
  const invoices =
    new PlatformInvoiceService(
      new PlatformInvoiceRepository(
        db,
      ),
      clients,
    );
  const signup =
    new PlatformSignupService(
      organizations,
      users,
      sessions,
    );

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding,
    clients,
    projects,
    invoices,
    signup,
    baseDomain:
      process.env
        .PLATFORM_BASE_DOMAIN ||
      undefined,
    secureCookie:
      process.env
        .PLATFORM_SECURE_COOKIE ===
      "true",
  });

  const port = Number(
    process.env.PLATFORM_PORT ?? 3300,
  );

  const server = app.listen(
    port,
    () => {
      console.log(
        `All Elite Cloud platform listening on port ${port}`,
      );
    },
  );

  let shuttingDown = false;

  const shutdown = (
    signal: string,
  ): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(
      `Received ${signal}. Shutting down platform.`,
    );

    server.close(() => {
      void db
        .close()
        .catch(() => undefined)
        .finally(() =>
          process.exit(0),
        );
    });
  };

  process.on("SIGINT", () =>
    shutdown("SIGINT"),
  );
  process.on("SIGTERM", () =>
    shutdown("SIGTERM"),
  );
}

start().catch(
  (error: unknown) => {
    console.error(
      "All Elite Cloud platform failed to start.",
      error,
    );

    process.exit(1);
  },
);
