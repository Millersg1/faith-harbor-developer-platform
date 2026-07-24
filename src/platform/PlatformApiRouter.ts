import {
  Router,
  type Response,
} from "express";

import type { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { requireRole } from "./auth/requireRole";
import {
  BillingService,
  PlanLimitError,
} from "./billing/BillingService";
import { PLANS } from "./billing/Plan";
import type { PlatformClientService } from "./clients/PlatformClientService";
import type { PlatformHostingService } from "./hosting/PlatformHostingService";
import type { PlatformInvoiceLineItem } from "./invoices/PlatformInvoice";
import type { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import type { PlatformProjectService } from "./projects/PlatformProjectService";
import { GeneratorUnavailableError } from "./websites/PlatformWebsiteService";
import type { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import type { PlatformWebsiteRecord } from "./websites/PlatformWebsite";

export interface PlatformApiDependencies {
  clients: PlatformClientService;
  projects?: PlatformProjectService;
  invoices?: PlatformInvoiceService;
  domains?: OrganizationDomainService;
  hosting?: PlatformHostingService;
  websites?: PlatformWebsiteService;
  billing?: BillingService;
}

/**
 * The tenant-scoped platform API. It is always mounted *behind* auth /
 * the tenant middleware, so every handler runs inside an organization's
 * scope and the services it calls are automatically confined to that
 * tenant. No handler here ever mentions an organization id — isolation
 * is ambient.
 */
export function createPlatformApiRouter(
  deps: PlatformApiDependencies,
): Router {
  const router = Router();

  // ---- Billing & plans ----
  if (deps.billing) {
    const billing = deps.billing;

    // The public plan catalog (same tiers as the marketing site).
    router.get(
      "/billing/plans",
      (_req, res) => {
        res.json({ plans: PLANS });
      },
    );

    // The acting tenant's current subscription + plan.
    router.get(
      "/billing",
      (_req, res, next) => {
        Promise.all([
          billing.getSubscription(),
          billing.getPlan(),
        ])
          .then(
            ([
              subscription,
              plan,
            ]) =>
              res.json({
                subscription,
                plan,
              }),
          )
          .catch(next);
      },
    );

    // Change plan (owner only). Enterprise is contact-sales → 400.
    router.post(
      "/billing/plan",
      requireRole("owner"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.planId,
          )
        ) {
          badRequest(
            res,
            "INVALID_PLAN",
            "A planId is required.",
          );

          return;
        }

        billing
          .changePlan(body.planId)
          .then((subscription) =>
            res.json({
              subscription,
            }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /unknown plan|contact sales/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_PLAN",
                  message,
                );

                return;
              }

              next(error);
            },
          );
      },
    );
  }

  // ---- Clients ----
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
      const body = asObject(
        req.body,
      );

      if (
        !isNonEmptyString(body.name)
      ) {
        badRequest(
          res,
          "INVALID_CLIENT",
          "A client requires a name.",
        );

        return;
      }

      deps.clients
        .create({
          name: body.name,
          email: optionalString(
            body.email,
          ),
          company: optionalString(
            body.company,
          ),
        })
        .then((client) =>
          res
            .status(201)
            .json({ client }),
        )
        .catch(next);
    },
  );

  // ---- Projects ----
  if (deps.projects) {
    const projects = deps.projects;

    router.get(
      "/projects",
      (_req, res, next) => {
        projects
          .list()
          .then((rows) =>
            res.json({
              projects: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/projects",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(body.name)
        ) {
          badRequest(
            res,
            "INVALID_PROJECT",
            "A project requires a name.",
          );

          return;
        }

        projects
          .create({
            name: body.name,
            clientId: optionalString(
              body.clientId,
            ),
            description:
              optionalString(
                body.description,
              ),
          })
          .then((project) =>
            res
              .status(201)
              .json({ project }),
          )
          .catch((error: unknown) =>
            validationOrNext(
              error,
              res,
              "INVALID_PROJECT",
              next,
            ),
          );
      },
    );
  }

  // ---- Invoices ----
  if (deps.invoices) {
    const invoices = deps.invoices;

    router.get(
      "/invoices",
      (_req, res, next) => {
        invoices
          .list()
          .then((rows) =>
            res.json({
              invoices: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/invoices",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        const lineItems =
          parseLineItems(
            body.lineItems,
          );

        if (!lineItems.length) {
          badRequest(
            res,
            "INVALID_INVOICE",
            "An invoice requires at least one line item.",
          );

          return;
        }

        invoices
          .create({
            clientId: optionalString(
              body.clientId,
            ),
            lineItems,
          })
          .then((invoice) =>
            res
              .status(201)
              .json({ invoice }),
          )
          .catch((error: unknown) =>
            validationOrNext(
              error,
              res,
              "INVALID_INVOICE",
              next,
            ),
          );
      },
    );
  }

  // ---- Custom (white-label) domains ----
  if (deps.domains) {
    const domains = deps.domains;

    router.get(
      "/domains",
      (_req, res, next) => {
        domains
          .listMine()
          .then((rows) =>
            res.json({
              domains: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/domains",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.domain,
          )
        ) {
          badRequest(
            res,
            "INVALID_DOMAIN",
            "A domain is required.",
          );

          return;
        }

        const domainInput = body.domain;

        // Enforce the tenant's plan limit on custom domains before adding
        // one (white-label domains are a higher-tier feature).
        const billing = deps.billing;
        const gate = billing
          ? domains
              .listMine()
              .then((rows) =>
                billing.assertWithinLimit(
                  "customDomains",
                  rows.length,
                ),
              )
          : Promise.resolve();

        gate
          .then(() =>
            domains.add(domainInput),
          )
          .then((domain) =>
            res
              .status(201)
              .json({ domain }),
          )
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";
            if (
              error instanceof
              PlanLimitError
            ) {
              res.status(402).json({
                error: {
                  code: "PLAN_LIMIT",
                  message,
                },
              });
              return;
            }
            if (
              /already in use/i.test(
                message,
              )
            ) {
              res.status(409).json({
                error: {
                  code: "DOMAIN_TAKEN",
                  message,
                },
              });
              return;
            }
            if (
              /valid domain/i.test(
                message,
              )
            ) {
              badRequest(
                res,
                "INVALID_DOMAIN",
                message,
              );
              return;
            }
            next(error);
          });
      },
    );

    router.post(
      "/domains/:id/verify",
      requireRole("owner", "admin"),
      (req, res, next) => {
        domains
          .verify(
            String(req.params.id),
          )
          .then((domain) =>
            res.json({ domain }),
          )
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";
            if (
              /not found/i.test(message)
            ) {
              res.status(404).json({
                error: {
                  code: "DOMAIN_NOT_FOUND",
                  message,
                },
              });
              return;
            }
            if (
              /verification|TXT record/i.test(
                message,
              )
            ) {
              res.status(409).json({
                error: {
                  code: "DOMAIN_UNVERIFIED",
                  message,
                },
              });
              return;
            }
            next(error);
          });
      },
    );

    router.delete(
      "/domains/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        domains
          .remove(
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(next);
      },
    );
  }

  // ---- Hosting (All Elite Hosting — websites) ----
  if (deps.hosting) {
    const hosting = deps.hosting;

    router.get(
      "/hosting",
      (_req, res, next) => {
        hosting
          .list()
          .then((accounts) =>
            res.json({
              hosting: accounts,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/hosting",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.domain,
          )
        ) {
          badRequest(
            res,
            "INVALID_HOSTING",
            "A website domain is required.",
          );

          return;
        }

        // Enforce the tenant's plan limit on websites before creating one.
        const billing = deps.billing;
        const gate = billing
          ? hosting
              .count()
              .then((count) =>
                billing.assertWithinLimit(
                  "sites",
                  count,
                ),
              )
          : Promise.resolve();

        gate
          .then(() =>
            hosting.create({
              domain: String(
                body.domain,
              ),
              clientId:
                optionalString(
                  body.clientId,
                ),
              plan: optionalString(
                body.plan,
              ),
              notes: optionalString(
                body.notes,
              ),
            }),
          )
          .then((account) =>
            res
              .status(201)
              .json({
                hosting: account,
              }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                error instanceof
                PlanLimitError
              ) {
                res
                  .status(402)
                  .json({
                    error: {
                      code: "PLAN_LIMIT",
                      message,
                    },
                  });

                return;
              }

              if (
                /valid domain/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_HOSTING",
                  message,
                );

                return;
              }

              if (
                /client not found/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "UNKNOWN_CLIENT",
                  "That client isn't in your organization.",
                );

                return;
              }

              next(error);
            },
          );
      },
    );

    router.patch(
      "/hosting/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        hosting
          .update(
            String(req.params.id),
            {
              domain: optionalString(
                body.domain,
              ),
              plan: optionalString(
                body.plan,
              ),
              status:
                optionalString(
                  body.status,
                ) as
                  | undefined
                  | "pending"
                  | "active"
                  | "suspended"
                  | "cancelled",
              notes: optionalString(
                body.notes,
              ),
            },
          )
          .then((account) =>
            res.json({
              hosting: account,
            }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /not found/i.test(
                  message,
                )
              ) {
                res
                  .status(404)
                  .json({
                    error: {
                      code: "HOSTING_NOT_FOUND",
                      message,
                    },
                  });

                return;
              }

              if (
                /valid domain/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_HOSTING",
                  message,
                );

                return;
              }

              next(error);
            },
          );
      },
    );

    router.delete(
      "/hosting/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        hosting
          .delete(
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(next);
      },
    );
  }

  // ---- Website builder (AI-generated sites) ----
  if (deps.websites) {
    const websites = deps.websites;

    router.get(
      "/websites",
      (_req, res, next) => {
        websites
          .list()
          .then((list) =>
            res.json({
              generationAvailable:
                websites.generationAvailable(),
              websites: list.map(
                websiteSummary,
              ),
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/websites",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(body.name)
        ) {
          badRequest(
            res,
            "INVALID_WEBSITE",
            "A website needs a name.",
          );

          return;
        }

        const name = body.name;

        // Websites count against the plan's site limit.
        const billing = deps.billing;
        const gate = billing
          ? websites
              .count()
              .then((count) =>
                billing.assertWithinLimit(
                  "sites",
                  count,
                ),
              )
          : Promise.resolve();

        gate
          .then(() =>
            websites.create({
              name,
              brief: optionalString(
                body.brief,
              ),
              accentColor:
                optionalString(
                  body.accentColor,
                ),
              clientId:
                optionalString(
                  body.clientId,
                ),
            }),
          )
          .then((website) =>
            res
              .status(201)
              .json({
                website:
                  websiteSummary(
                    website,
                  ),
              }),
          )
          .catch(
            (error: unknown) => {
              if (
                error instanceof
                PlanLimitError
              ) {
                res
                  .status(402)
                  .json({
                    error: {
                      code: "PLAN_LIMIT",
                      message:
                        error.message,
                    },
                  });

                return;
              }

              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /client not found/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "UNKNOWN_CLIENT",
                  "That client isn't in your organization.",
                );

                return;
              }

              next(error);
            },
          );
      },
    );

    router.post(
      "/websites/:id/generate",
      requireRole("owner", "admin"),
      (req, res, next) => {
        websites
          .generate(
            String(req.params.id),
          )
          .then((website) =>
            res.json({
              website:
                websiteSummary(
                  website,
                ),
            }),
          )
          .catch(
            (error: unknown) => {
              if (
                error instanceof
                GeneratorUnavailableError
              ) {
                res
                  .status(503)
                  .json({
                    error: {
                      code: "AI_NOT_CONFIGURED",
                      message:
                        error.message,
                    },
                  });

                return;
              }

              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /not found/i.test(
                  message,
                )
              ) {
                res
                  .status(404)
                  .json({
                    error: {
                      code: "WEBSITE_NOT_FOUND",
                      message,
                    },
                  });

                return;
              }

              next(error);
            },
          );
      },
    );

    // Serves the generated HTML for preview (authenticated, tenant-scoped).
    router.get(
      "/websites/:id/preview",
      (req, res, next) => {
        websites
          .get(String(req.params.id))
          .then((website) => {
            // The body is AI-generated HTML. Serve it fully sandboxed so
            // nothing in it can run script or reach the platform origin —
            // it renders as an isolated static document only.
            sandboxPreview(res);

            if (!website.html) {
              res
                .status(404)
                .type("html")
                .send(
                  "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;padding:40px\">Nothing generated yet. Click Generate to build this site.</body>",
                );

              return;
            }

            res
              .type("html")
              .send(website.html);
          })
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /not found/i.test(
                  message,
                )
              ) {
                res
                  .status(404)
                  .type("html")
                  .send(
                    "<!doctype html><meta charset=utf-8><body>Not found.</body>",
                  );

                return;
              }

              next(error);
            },
          );
      },
    );

    router.patch(
      "/websites/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        websites
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              brief: optionalString(
                body.brief,
              ),
              status:
                optionalString(
                  body.status,
                ) as
                  | undefined
                  | "draft"
                  | "published",
              domain: optionalString(
                body.domain,
              ),
            },
          )
          .then((website) =>
            res.json({
              website:
                websiteSummary(
                  website,
                ),
            }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /not found/i.test(
                  message,
                )
              ) {
                res
                  .status(404)
                  .json({
                    error: {
                      code: "WEBSITE_NOT_FOUND",
                      message,
                    },
                  });

                return;
              }

              next(error);
            },
          );
      },
    );

    router.delete(
      "/websites/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        websites
          .delete(
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(next);
      },
    );
  }

  return router;
}

/**
 * Locks down a website-preview response so the AI-generated body cannot run
 * script or reach the platform origin. The CSP `sandbox` directive gives the
 * document a unique opaque origin with scripts/forms disabled, so even a
 * malicious generated page renders as an inert static document. `nosniff`
 * and an inline Content-Disposition harden it further.
 */
function sandboxPreview(
  res: Response,
): void {
  res.setHeader(
    "Content-Security-Policy",
    "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
  );
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );
  res.setHeader(
    "Content-Disposition",
    'inline; filename="preview.html"',
  );
}

/**
 * A website without its (potentially large) HTML body — for lists and
 * mutation responses. Whether content exists is surfaced as a flag.
 */
function websiteSummary(
  website: PlatformWebsiteRecord,
): Record<string, unknown> {
  return {
    id: website.id,
    name: website.name,
    brief: website.brief,
    accentColor: website.accentColor,
    clientId: website.clientId,
    status: website.status,
    domain: website.domain,
    hasContent: Boolean(
      website.html,
    ),
    createdAt: website.createdAt,
    updatedAt: website.updatedAt,
  };
}

function asObject(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object"
    ? (value as Record<
        string,
        unknown
      >)
    : {};
}

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function optionalString(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    value.trim()
    ? value
    : undefined;
}

function parseLineItems(
  value: unknown,
): PlatformInvoiceLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: PlatformInvoiceLineItem[] =
    [];

  for (const raw of value) {
    const row = asObject(raw);

    if (
      !isNonEmptyString(
        row.description,
      )
    ) {
      continue;
    }

    items.push({
      description: row.description,
      quantity: Number(
        row.quantity ?? 1,
      ),
      unitPrice: Number(
        row.unitPrice ?? 0,
      ),
    });
  }

  return items;
}

function badRequest(
  res: Response,
  code: string,
  message: string,
): void {
  res
    .status(400)
    .json({ error: { code, message } });
}

/**
 * Maps a service validation error to a 400; anything else bubbles to the
 * error handler.
 */
function validationOrNext(
  error: unknown,
  res: Response,
  code: string,
  next: (error?: unknown) => void,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    /required|not found|line item|valid/i.test(
      message,
    )
  ) {
    badRequest(res, code, message);
    return;
  }

  next(error);
}
