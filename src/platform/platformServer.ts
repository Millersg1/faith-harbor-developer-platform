import "dotenv/config";

import { PostgresDatabase } from "../persistence/PostgresDatabase";
import { OrganizationRepository } from "../tenancy/OrganizationRepository";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainRepository } from "../tenancy/OrganizationDomainRepository";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminRepository } from "./admin/PlatformAdminRepository";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BillingService } from "./billing/BillingService";
import { SubscriptionRepository } from "./billing/SubscriptionRepository";
import {
  DisconnectedStripeSubscriptionGateway,
  HttpStripeSubscriptionGateway,
  type StripeSubscriptionGateway,
} from "./billing/StripeSubscriptionGateway";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { PlatformHostingRepository } from "./hosting/PlatformHostingRepository";
import { PlatformHostingService } from "./hosting/PlatformHostingService";
import { PlatformWebsiteRepository } from "./websites/PlatformWebsiteRepository";
import { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import {
  DisconnectedWebsiteGenerator,
  OpenAiWebsiteGenerator,
  type WebsiteGenerator,
} from "./websites/WebsiteGenerator";
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
  const domains =
    new OrganizationDomainService(
      new OrganizationDomainRepository(
        db,
      ),
    );
  // Stripe subscription billing: live when a secret key is present in the
  // platform env, otherwise a disconnected stub (so the platform runs, and
  // free-plan changes still work, with no key).
  const stripeSecret =
    process.env.STRIPE_SECRET_KEY?.trim();
  const stripeGateway: StripeSubscriptionGateway =
    stripeSecret
      ? new HttpStripeSubscriptionGateway(
          {
            secretKey: stripeSecret,
            webhookSecret:
              process.env.STRIPE_WEBHOOK_SECRET?.trim(),
          },
        )
      : new DisconnectedStripeSubscriptionGateway();
  const billing =
    new BillingService(
      new SubscriptionRepository(db),
      stripeGateway,
    );
  const hosting =
    new PlatformHostingService(
      new PlatformHostingRepository(
        db,
      ),
      clients,
    );

  // The website builder's AI generator: live when an OpenAI key is present
  // in the platform env, otherwise a disconnected stub that reports "not
  // configured" (so the platform runs fine keyless).
  const openAiKey =
    process.env.OPENAI_API_KEY?.trim();
  const websiteGenerator: WebsiteGenerator =
    openAiKey
      ? new OpenAiWebsiteGenerator({
          apiKey: openAiKey,
          model:
            process.env
              .OPENAI_MODEL ||
            undefined,
        })
      : new DisconnectedWebsiteGenerator();
  const websites =
    new PlatformWebsiteService(
      new PlatformWebsiteRepository(
        db,
      ),
      websiteGenerator,
      clients,
    );

  const admins =
    new PlatformAdminService(
      new PlatformAdminRepository(db),
    );
  const adminSessions =
    new PlatformAdminSessionService(
      db,
    );

  // Bootstrap the first platform admin from the environment, once.
  const bootEmail =
    process.env.PLATFORM_ADMIN_EMAIL;
  const bootPass =
    process.env
      .PLATFORM_ADMIN_PASSWORD;

  if (bootEmail && bootPass) {
    try {
      const created =
        await admins.ensureBootstrapAdmin(
          bootEmail,
          bootPass,
          process.env
            .PLATFORM_ADMIN_NAME,
        );

      if (created) {
        console.log(
          `Bootstrapped platform admin: ${bootEmail}`,
        );
      }
    } catch (error) {
      console.error(
        "Failed to bootstrap platform admin.",
        error,
      );
    }
  }

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding,
    clients,
    projects,
    invoices,
    signup,
    domains,
    hosting,
    websites,
    billing,
    admins,
    adminSessions,
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
