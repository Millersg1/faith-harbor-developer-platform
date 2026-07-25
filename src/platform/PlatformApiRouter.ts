import {
  Router,
  type Response,
} from "express";

import { normalizeDomain } from "../tenancy/OrganizationDomain";
import type { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { requireRole } from "./auth/requireRole";
import type { AuthedRequest } from "./auth/requireUser";
import {
  toPublicUser,
  type PlatformUserRole,
} from "./users/PlatformUser";
import type { PlatformUserService } from "./users/PlatformUserService";
import {
  BillingService,
  PlanLimitError,
} from "./billing/BillingService";
import type { AiUsageRepository } from "./ai/AiUsageRepository";
import type { OrganizationAiSettingsService } from "./ai/OrganizationAiSettingsService";
import { PLANS } from "./billing/Plan";
import type { PlatformBrandService } from "./brands/PlatformBrandService";
import type { PlatformClientService } from "./clients/PlatformClientService";
import type { PlatformLeadService } from "./crm/PlatformLeadService";
import type { PlatformCampaignService } from "./marketing/PlatformCampaignService";
import type { PlatformReviewService } from "./reviews/PlatformReviewService";
import type { PlatformHostingService } from "./hosting/PlatformHostingService";
import type { PlatformInvoiceLineItem } from "./invoices/PlatformInvoice";
import type { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import type { PlatformProjectService } from "./projects/PlatformProjectService";
import type { PlatformTicketService } from "./support/PlatformTicketService";
import { GeneratorUnavailableError } from "./websites/PlatformWebsiteService";
import type { PlatformWebsiteService } from "./websites/PlatformWebsiteService";
import type { PlatformWebsiteRecord } from "./websites/PlatformWebsite";

export interface PlatformApiDependencies {
  clients: PlatformClientService;
  users?: PlatformUserService;
  projects?: PlatformProjectService;
  invoices?: PlatformInvoiceService;
  domains?: OrganizationDomainService;
  hosting?: PlatformHostingService;
  tickets?: PlatformTicketService;
  leads?: PlatformLeadService;
  campaigns?: PlatformCampaignService;
  reviews?: PlatformReviewService;
  brands?: PlatformBrandService;
  websites?: PlatformWebsiteService;
  aiSettings?: OrganizationAiSettingsService;
  aiUsage?: AiUsageRepository;
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

        // Build absolute return URLs from the incoming request (works
        // behind the HTTPS proxy via X-Forwarded-Proto).
        const proto =
          (req.headers[
            "x-forwarded-proto"
          ] as string) ||
          req.protocol ||
          "https";
        const host = req.get("host");
        const base = `${proto}://${host}`;

        billing
          .startPlanChange(
            body.planId,
            {
              successUrl: `${base}/app?billing=success`,
              cancelUrl: `${base}/app?billing=cancel`,
            },
          )
          .then((outcome) => {
            if (
              outcome.status ===
              "checkout"
            ) {
              res.json({
                checkoutUrl:
                  outcome.url,
              });

              return;
            }

            res.json({
              subscription:
                outcome.subscription,
            });
          })
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

  // ---- Team members ----
  if (deps.users) {
    const users = deps.users;

    const isRole = (
      value: unknown,
    ): value is PlatformUserRole =>
      value === "owner" ||
      value === "admin" ||
      value === "member";

    router.get(
      "/team",
      requireRole("owner", "admin"),
      (_req, res, next) => {
        users
          .list()
          .then((list) =>
            res.json({
              team: list.map(
                toPublicUser,
              ),
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/team",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.email,
          ) ||
          !isNonEmptyString(
            body.password,
          )
        ) {
          badRequest(
            res,
            "INVALID_MEMBER",
            "An email and a password (8+ chars) are required.",
          );

          return;
        }

        const email = String(
          body.email,
        );
        const password = String(
          body.password,
        );
        const role = isRole(body.role)
          ? body.role
          : "member";
        const name = optionalString(
          body.name,
        );

        // Team members count against the plan's seat limit.
        const billing = deps.billing;
        const gate = billing
          ? users
              .list()
              .then((list) =>
                billing.assertWithinLimit(
                  "seats",
                  list.length,
                ),
              )
          : Promise.resolve();

        gate
          .then(() =>
            users.create({
              email,
              password,
              role,
              name,
            }),
          )
          .then((user) =>
            res.status(201).json({
              member:
                toPublicUser(user),
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
                /already exists/i.test(
                  message,
                )
              ) {
                res
                  .status(409)
                  .json({
                    error: {
                      code: "EMAIL_TAKEN",
                      message,
                    },
                  });

                return;
              }

              if (
                /valid email|at least 8/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_MEMBER",
                  message,
                );

                return;
              }

              next(error);
            },
          );
      },
    );

    router.patch(
      "/team/:id",
      requireRole("owner"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (!isRole(body.role)) {
          badRequest(
            res,
            "INVALID_ROLE",
            "Role must be owner, admin, or member.",
          );

          return;
        }

        users
          .updateRole(
            String(req.params.id),
            body.role,
          )
          .then((user) =>
            res.json({
              member:
                toPublicUser(user),
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
                /last owner/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "LAST_OWNER",
                  message,
                );

                return;
              }

              if (
                /not found/i.test(
                  message,
                )
              ) {
                res
                  .status(404)
                  .json({
                    error: {
                      code: "MEMBER_NOT_FOUND",
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
      "/team/:id",
      requireRole("owner"),
      (req, res, next) => {
        const id = String(
          req.params.id,
        );
        const acting = (
          req as AuthedRequest
        ).auth?.user;

        if (
          acting &&
          acting.id === id
        ) {
          badRequest(
            res,
            "CANNOT_REMOVE_SELF",
            "You can't remove your own account.",
          );

          return;
        }

        users
          .remove(id)
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /last owner/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "LAST_OWNER",
                  message,
                );

                return;
              }

              if (
                /not found/i.test(
                  message,
                )
              ) {
                res
                  .status(404)
                  .json({
                    error: {
                      code: "MEMBER_NOT_FOUND",
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

  // ---- Support tickets ----
  if (deps.tickets) {
    const tickets = deps.tickets;

    router.get(
      "/tickets",
      (_req, res, next) => {
        tickets
          .list()
          .then((rows) =>
            res.json({
              tickets: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/tickets",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.subject,
          )
        ) {
          badRequest(
            res,
            "INVALID_TICKET",
            "A ticket needs a subject.",
          );

          return;
        }

        tickets
          .create({
            subject: String(
              body.subject,
            ),
            description:
              optionalString(
                body.description,
              ),
            clientId: optionalString(
              body.clientId,
            ),
            priority: optionalString(
              body.priority,
            ) as never,
            assignee: optionalString(
              body.assignee,
            ),
          })
          .then((ticket) =>
            res
              .status(201)
              .json({ ticket }),
          )
          .catch(
            (error: unknown) => {
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

    router.patch(
      "/tickets/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        tickets
          .update(
            String(req.params.id),
            {
              subject:
                optionalString(
                  body.subject,
                ),
              description:
                optionalString(
                  body.description,
                ),
              status: optionalString(
                body.status,
              ) as never,
              priority:
                optionalString(
                  body.priority,
                ) as never,
              assignee:
                optionalString(
                  body.assignee,
                ),
            },
          )
          .then((ticket) =>
            res.json({ ticket }),
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
                      code: "TICKET_NOT_FOUND",
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
      "/tickets/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        tickets
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

  // ---- CRM: sales leads ----
  if (deps.leads) {
    const leads = deps.leads;

    router.get(
      "/leads",
      (_req, res, next) => {
        leads
          .list()
          .then((rows) =>
            res.json({
              leads: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/leads",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.name,
          )
        ) {
          badRequest(
            res,
            "INVALID_LEAD",
            "A lead needs a name.",
          );

          return;
        }

        leads
          .create({
            name: String(body.name),
            company: optionalString(
              body.company,
            ),
            email: optionalString(
              body.email,
            ),
            phone: optionalString(
              body.phone,
            ),
            source: optionalString(
              body.source,
            ),
            serviceInterest:
              optionalString(
                body.serviceInterest,
              ),
            estimatedValue:
              body.estimatedValue ==
              null
                ? undefined
                : Number(
                    body.estimatedValue,
                  ),
            status: optionalString(
              body.status,
            ) as never,
            owner: optionalString(
              body.owner,
            ),
            notes: optionalString(
              body.notes,
            ),
            clientId: optionalString(
              body.clientId,
            ),
          })
          .then((lead) =>
            res
              .status(201)
              .json({ lead }),
          )
          .catch(
            (error: unknown) => {
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

    router.patch(
      "/leads/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        leads
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              company:
                optionalString(
                  body.company,
                ),
              email: optionalString(
                body.email,
              ),
              phone: optionalString(
                body.phone,
              ),
              source:
                optionalString(
                  body.source,
                ),
              serviceInterest:
                optionalString(
                  body.serviceInterest,
                ),
              estimatedValue:
                body.estimatedValue ==
                null
                  ? undefined
                  : Number(
                      body.estimatedValue,
                    ),
              status:
                optionalString(
                  body.status,
                ) as never,
              owner: optionalString(
                body.owner,
              ),
              notes: optionalString(
                body.notes,
              ),
            },
          )
          .then((lead) =>
            res.json({ lead }),
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
                      code: "LEAD_NOT_FOUND",
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
      "/leads/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        leads
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

  // ---- Marketing campaigns ----
  if (deps.campaigns) {
    const campaigns = deps.campaigns;

    router.get(
      "/campaigns",
      (_req, res, next) => {
        campaigns
          .list()
          .then((rows) =>
            res.json({
              campaigns: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/campaigns",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.name,
          )
        ) {
          badRequest(
            res,
            "INVALID_CAMPAIGN",
            "A campaign needs a name.",
          );

          return;
        }

        campaigns
          .create({
            name: String(body.name),
            channel: optionalString(
              body.channel,
            ),
            status: optionalString(
              body.status,
            ) as never,
            audience:
              optionalString(
                body.audience,
              ),
            budget:
              body.budget == null
                ? undefined
                : Number(
                    body.budget,
                  ),
            spend:
              body.spend == null
                ? undefined
                : Number(body.spend),
            startDate:
              optionalString(
                body.startDate,
              ),
            endDate: optionalString(
              body.endDate,
            ),
            owner: optionalString(
              body.owner,
            ),
            notes: optionalString(
              body.notes,
            ),
            clientId: optionalString(
              body.clientId,
            ),
          })
          .then((campaign) =>
            res
              .status(201)
              .json({ campaign }),
          )
          .catch(
            (error: unknown) => {
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

    router.patch(
      "/campaigns/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        campaigns
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              channel:
                optionalString(
                  body.channel,
                ),
              status:
                optionalString(
                  body.status,
                ) as never,
              audience:
                optionalString(
                  body.audience,
                ),
              budget:
                body.budget == null
                  ? undefined
                  : Number(
                      body.budget,
                    ),
              spend:
                body.spend == null
                  ? undefined
                  : Number(
                      body.spend,
                    ),
              startDate:
                optionalString(
                  body.startDate,
                ),
              endDate:
                optionalString(
                  body.endDate,
                ),
              owner: optionalString(
                body.owner,
              ),
              notes: optionalString(
                body.notes,
              ),
            },
          )
          .then((campaign) =>
            res.json({ campaign }),
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
                      code: "CAMPAIGN_NOT_FOUND",
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
      "/campaigns/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        campaigns
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

  // ---- Reviews (reputation management) ----
  if (deps.reviews) {
    const reviews = deps.reviews;

    router.get(
      "/reviews",
      (_req, res, next) => {
        reviews
          .list()
          .then((rows) =>
            res.json({
              reviews: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/reviews",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.author,
          )
        ) {
          badRequest(
            res,
            "INVALID_REVIEW",
            "A review needs an author.",
          );

          return;
        }

        reviews
          .create({
            author: String(
              body.author,
            ),
            rating:
              body.rating == null
                ? 5
                : Number(body.rating),
            comment: optionalString(
              body.comment,
            ),
            source: optionalString(
              body.source,
            ),
            replyText:
              optionalString(
                body.replyText,
              ),
            clientId: optionalString(
              body.clientId,
            ),
          })
          .then((review) =>
            res
              .status(201)
              .json({ review }),
          )
          .catch(
            (error: unknown) => {
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

    router.patch(
      "/reviews/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        reviews
          .update(
            String(req.params.id),
            {
              author: optionalString(
                body.author,
              ),
              rating:
                body.rating == null
                  ? undefined
                  : Number(
                      body.rating,
                    ),
              comment:
                optionalString(
                  body.comment,
                ),
              source:
                optionalString(
                  body.source,
                ),
              replyText:
                optionalString(
                  body.replyText,
                ),
            },
          )
          .then((review) =>
            res.json({ review }),
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
                      code: "REVIEW_NOT_FOUND",
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
      "/reviews/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        reviews
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

  // ---- Brands ----
  if (deps.brands) {
    const brands = deps.brands;

    router.get(
      "/brands",
      (_req, res, next) => {
        brands
          .list()
          .then((rows) =>
            res.json({
              brands: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/brands",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.name,
          )
        ) {
          badRequest(
            res,
            "INVALID_BRAND",
            "A brand needs a name.",
          );

          return;
        }

        brands
          .create({
            name: String(body.name),
            domain: optionalString(
              body.domain,
            ),
            fromEmail:
              optionalString(
                body.fromEmail,
              ),
            emailSignature:
              optionalString(
                body.emailSignature,
              ),
          })
          .then((brand) =>
            res
              .status(201)
              .json({ brand }),
          )
          .catch(next);
      },
    );

    router.patch(
      "/brands/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        brands
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              domain: optionalString(
                body.domain,
              ),
              fromEmail:
                optionalString(
                  body.fromEmail,
                ),
              emailSignature:
                optionalString(
                  body.emailSignature,
                ),
            },
          )
          .then((brand) =>
            res.json({ brand }),
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
                      code: "BRAND_NOT_FOUND",
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
      "/brands/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        brands
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

              if (
                error instanceof
                PlanLimitError
              ) {
                res
                  .status(402)
                  .json({
                    error: {
                      code: "AI_ALLOWANCE_REACHED",
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

    // Publish a generated site to one of the tenant's VERIFIED custom
    // domains, so it serves live at that domain.
    router.post(
      "/websites/:id/publish",
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

        const domain =
          normalizeDomain(
            String(body.domain),
          );

        const domainsSvc =
          deps.domains;

        const check = domainsSvc
          ? domainsSvc
              .listMine()
              .then((list) => {
                const ok = list.some(
                  (d) =>
                    d.domain ===
                      domain &&
                    d.verified,
                );

                if (!ok) {
                  throw new Error(
                    "DOMAIN_NOT_VERIFIED",
                  );
                }
              })
          : Promise.reject(
              new Error(
                "DOMAIN_NOT_VERIFIED",
              ),
            );

        check
          .then(() =>
            websites.publish(
              String(
                req.params.id,
              ),
              domain,
            ),
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
                /DOMAIN_NOT_VERIFIED/.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "DOMAIN_NOT_VERIFIED",
                  "Publish to one of your verified custom domains — add and verify the domain first.",
                );

                return;
              }

              if (
                /before publishing/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "NO_CONTENT",
                  message,
                );

                return;
              }

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

    router.post(
      "/websites/:id/unpublish",
      requireRole("owner", "admin"),
      (req, res, next) => {
        websites
          .unpublish(
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
          .catch(next);
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

  // ---- AI settings (bring-your-own-key) ----
  if (deps.aiSettings) {
    const aiSettings = deps.aiSettings;

    router.get(
      "/ai-settings",
      (_req, res, next) => {
        aiSettings
          .getPublic()
          .then((settings) =>
            res.json({ settings }),
          )
          .catch(next);
      },
    );

    router.put(
      "/ai-settings",
      requireRole("owner"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        aiSettings
          .set({
            provider:
              body.provider as never,
            apiKey: String(
              body.apiKey ?? "",
            ),
            model: optionalString(
              body.model,
            ),
          })
          .then((settings) =>
            res.json({ settings }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /provider|valid API key/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_AI_SETTINGS",
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
      "/ai-settings",
      requireRole("owner"),
      (_req, res, next) => {
        aiSettings
          .clear()
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(next);
      },
    );
  }

  // ---- AI usage (metering) ----
  if (deps.aiUsage) {
    const aiUsage = deps.aiUsage;

    router.get(
      "/ai-usage",
      (_req, res, next) => {
        const now = new Date();
        const since = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            1,
          ),
        ).toISOString();

        Promise.all([
          aiUsage.summarySince(since),
          aiUsage.platformCountSince(
            "website_generation",
            since,
          ),
          deps.billing?.getPlan(),
        ])
          .then(
            ([
              summary,
              platformGenerations,
              plan,
            ]) =>
              res.json({
                periodStart: since,
                usage: summary,
                costUsd:
                  summary.costMicros /
                  1_000_000,
                platformCostUsd:
                  summary.platformCostMicros /
                  1_000_000,
                // Plan's monthly included-AI allowance + how much is used.
                aiAllowance: plan
                  ? plan.limits
                      .aiGenerations
                  : null,
                platformGenerationsUsed:
                  platformGenerations,
              }),
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
