import {
  Router,
  type NextFunction,
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
import type { PlatformEmailService } from "./email/PlatformEmailService";
import type { PlatformClientService } from "./clients/PlatformClientService";
import type { PlatformLeadService } from "./crm/PlatformLeadService";
import type { DripService } from "./drip/DripService";
import type { ActivityService } from "./events/ActivityService";
import type { NotificationService } from "./notifications/NotificationService";
import type { SearchService } from "./search/SearchService";
import {
  FileQuotaError,
  FileValidationError,
  type PlatformFileService,
} from "./files/PlatformFileService";
import type { PlatformFileRecord } from "./files/PlatformFile";
import {
  FormValidationError,
  type PlatformFormService,
} from "./forms/PlatformFormService";
import type { FormField } from "./forms/PlatformForm";
import {
  CalendarValidationError,
  type CalendarService,
} from "./calendar/CalendarService";
import {
  KnowledgeNotFoundError,
  KnowledgeValidationError,
  type KnowledgeService,
} from "./knowledge/KnowledgeService";
import type { AuditService } from "./audit/AuditService";
import type { PlatformCampaignService } from "./marketing/PlatformCampaignService";
import type { PlatformReviewService } from "./reviews/PlatformReviewService";
import type { PlatformHostingService } from "./hosting/PlatformHostingService";
import type { PlatformInvoiceLineItem } from "./invoices/PlatformInvoice";
import type { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import {
  toPublicClientUser,
} from "./portal/ClientUser";
import type { ClientUserService } from "./portal/ClientUserService";
import type { PlatformProductService } from "./products/PlatformProductService";
import type { PlatformBookService } from "./publishing/PlatformBookService";
import type { PlatformProgramService } from "./programs/PlatformProgramService";
import type { PlatformProjectService } from "./projects/PlatformProjectService";
import type { PlatformProposalService } from "./proposals/PlatformProposalService";
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
  proposals?: PlatformProposalService;
  campaigns?: PlatformCampaignService;
  reviews?: PlatformReviewService;
  brands?: PlatformBrandService;
  products?: PlatformProductService;
  books?: PlatformBookService;
  programs?: PlatformProgramService;
  clientUsers?: ClientUserService;
  email?: PlatformEmailService;
  drip?: DripService;
  activity?: ActivityService;
  notifications?: NotificationService;
  search?: SearchService;
  files?: PlatformFileService;
  forms?: PlatformFormService;
  calendar?: CalendarService;
  knowledge?: KnowledgeService;
  audit?: AuditService;
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

  // ---- Notifications (per-user) ----
  if (deps.notifications) {
    const notifications =
      deps.notifications;

    router.get(
      "/notifications",
      (req, res, next) => {
        const auth = (
          req as AuthedRequest
        ).auth;

        if (!auth) {
          badRequest(
            res,
            "NO_USER",
            "Not signed in.",
          );

          return;
        }

        const unreadOnly =
          req.query.unreadOnly ===
          "true";

        Promise.all([
          notifications.listForUser(
            auth.user.id,
            { unreadOnly },
          ),
          notifications.unreadCount(
            auth.user.id,
          ),
        ])
          .then(([rows, unread]) =>
            res.json({
              notifications: rows,
              unreadCount: unread,
            }),
          )
          .catch(next);
      },
    );

    router.get(
      "/notifications/unread-count",
      (req, res, next) => {
        const auth = (
          req as AuthedRequest
        ).auth;

        if (!auth) {
          res.json({ unreadCount: 0 });

          return;
        }

        notifications
          .unreadCount(auth.user.id)
          .then((unreadCount) =>
            res.json({ unreadCount }),
          )
          .catch(next);
      },
    );

    router.post(
      "/notifications/:id/read",
      (req, res, next) => {
        const auth = (
          req as AuthedRequest
        ).auth;

        if (!auth) {
          badRequest(
            res,
            "NO_USER",
            "Not signed in.",
          );

          return;
        }

        notifications
          .markRead(
            auth.user.id,
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(next);
      },
    );

    router.post(
      "/notifications/read-all",
      (req, res, next) => {
        const auth = (
          req as AuthedRequest
        ).auth;

        if (!auth) {
          badRequest(
            res,
            "NO_USER",
            "Not signed in.",
          );

          return;
        }

        notifications
          .markAllRead(auth.user.id)
          .then(() =>
            res.json({ ok: true }),
          )
          .catch(next);
      },
    );
  }

  // ---- Universal search ----
  if (deps.search) {
    const search = deps.search;

    router.get(
      "/search",
      (req, res, next) => {
        const q = optionalString(
          req.query.q,
        );

        if (!q) {
          res.json({ groups: [] });

          return;
        }

        search
          .search(q)
          .then((groups) =>
            res.json({ groups }),
          )
          .catch(next);
      },
    );
  }

  // ---- AI Knowledge Base ----
  if (deps.knowledge) {
    const knowledge = deps.knowledge;

    const knowledgeError = (
      res: Response,
      next: NextFunction,
      error: unknown,
    ): void => {
      if (
        error instanceof
        KnowledgeValidationError
      ) {
        badRequest(
          res,
          "INVALID_KNOWLEDGE",
          error.message,
        );

        return;
      }

      if (
        error instanceof
        KnowledgeNotFoundError
      ) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: (
              error as Error
            ).message,
          },
        });

        return;
      }

      next(error);
    };

    router.get(
      "/knowledge/collections",
      (_req, res, next) => {
        knowledge
          .listCollections()
          .then((collections) =>
            res.json({
              collections,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/knowledge/collections",
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
            "INVALID_KNOWLEDGE",
            "A collection needs a name.",
          );

          return;
        }

        knowledge
          .createCollection({
            name: String(body.name),
            description:
              optionalString(
                body.description,
              ),
          })
          .then((collection) =>
            res
              .status(201)
              .json({ collection }),
          )
          .catch((error: unknown) =>
            knowledgeError(
              res,
              next,
              error,
            ),
          );
      },
    );

    router.get(
      "/knowledge/collections/:id/documents",
      (req, res, next) => {
        knowledge
          .listDocuments(
            String(req.params.id),
          )
          .then((documents) =>
            res.json({ documents }),
          )
          .catch(next);
      },
    );

    router.post(
      "/knowledge/collections/:id/documents",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.name,
          ) ||
          !isNonEmptyString(
            body.content,
          )
        ) {
          badRequest(
            res,
            "INVALID_KNOWLEDGE",
            "A document needs a name and content.",
          );

          return;
        }

        knowledge
          .addDocument({
            collectionId: String(
              req.params.id,
            ),
            name: String(body.name),
            mimeType:
              optionalString(
                body.mimeType,
              ) || "text/plain",
            content: String(
              body.content,
            ),
          })
          .then((document) =>
            res
              .status(201)
              .json({ document }),
          )
          .catch((error: unknown) =>
            knowledgeError(
              res,
              next,
              error,
            ),
          );
      },
    );

    router.delete(
      "/knowledge/documents/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        knowledge
          .deleteDocument(
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch((error: unknown) =>
            knowledgeError(
              res,
              next,
              error,
            ),
          );
      },
    );

    router.post(
      "/knowledge/collections/:id/query",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.question,
          )
        ) {
          badRequest(
            res,
            "INVALID_KNOWLEDGE",
            "A question is required.",
          );

          return;
        }

        knowledge
          .query(
            String(req.params.id),
            String(body.question),
          )
          .then((answer) =>
            res.json(answer),
          )
          .catch((error: unknown) =>
            knowledgeError(
              res,
              next,
              error,
            ),
          );
      },
    );
  }

  // ---- Calendar ----
  if (deps.calendar) {
    const calendar = deps.calendar;

    router.get(
      "/calendar/events",
      (req, res, next) => {
        calendar
          .list({
            from: optionalString(
              req.query.from,
            ),
            to: optionalString(
              req.query.to,
            ),
          })
          .then((events) =>
            res.json({ events }),
          )
          .catch(next);
      },
    );

    router.post(
      "/calendar/events",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.title,
          ) ||
          !isNonEmptyString(
            body.startAt,
          )
        ) {
          badRequest(
            res,
            "INVALID_EVENT",
            "An event needs a title and a start time.",
          );

          return;
        }

        calendar
          .create({
            title: String(body.title),
            description:
              optionalString(
                body.description,
              ),
            location:
              optionalString(
                body.location,
              ),
            startAt: String(
              body.startAt,
            ),
            endAt: optionalString(
              body.endAt,
            ),
            allDay: Boolean(
              body.allDay,
            ),
            subjectType:
              optionalString(
                body.subjectType,
              ),
            subjectId:
              optionalString(
                body.subjectId,
              ),
            createdBy:
              actor(req).actorId,
          })
          .then((event) =>
            res
              .status(201)
              .json({ event }),
          )
          .catch((error: unknown) => {
            if (
              error instanceof
              CalendarValidationError
            ) {
              badRequest(
                res,
                "INVALID_EVENT",
                error.message,
              );

              return;
            }

            next(error);
          });
      },
    );

    router.patch(
      "/calendar/events/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        calendar
          .update(
            String(req.params.id),
            {
              title: optionalString(
                body.title,
              ),
              description:
                optionalString(
                  body.description,
                ),
              location:
                optionalString(
                  body.location,
                ),
              startAt:
                optionalString(
                  body.startAt,
                ),
              endAt: optionalString(
                body.endAt,
              ),
              allDay:
                body.allDay == null
                  ? undefined
                  : Boolean(
                      body.allDay,
                    ),
            },
          )
          .then((event) =>
            res.json({ event }),
          )
          .catch((error: unknown) => {
            if (
              error instanceof
              CalendarValidationError
            ) {
              badRequest(
                res,
                "INVALID_EVENT",
                error.message,
              );

              return;
            }

            notFoundOrNext(
              res,
              next,
              error,
              "EVENT_NOT_FOUND",
            );
          });
      },
    );

    router.delete(
      "/calendar/events/:id",
      (req, res, next) => {
        calendar
          .delete(
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "EVENT_NOT_FOUND",
            ),
          );
      },
    );
  }

  // ---- Forms ----
  if (deps.forms) {
    const forms = deps.forms;

    router.get(
      "/forms",
      (_req, res, next) => {
        forms
          .list()
          .then((rows) =>
            res.json({ forms: rows }),
          )
          .catch(next);
      },
    );

    router.post(
      "/forms",
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
            "INVALID_FORM",
            "A form needs a name.",
          );

          return;
        }

        forms
          .create({
            name: String(body.name),
            fields: Array.isArray(
              body.fields,
            )
              ? (body.fields as FormField[])
              : undefined,
            confirmationMessage:
              optionalString(
                body.confirmationMessage,
              ),
            notifyEmail:
              optionalString(
                body.notifyEmail,
              ),
            createLead:
              body.createLead ==
              null
                ? undefined
                : Boolean(
                    body.createLead,
                  ),
          })
          .then((form) =>
            res
              .status(201)
              .json({ form }),
          )
          .catch((error: unknown) => {
            if (
              error instanceof
              FormValidationError
            ) {
              badRequest(
                res,
                "INVALID_FORM",
                error.message,
              );

              return;
            }

            next(error);
          });
      },
    );

    router.get(
      "/forms/:id",
      (req, res, next) => {
        forms
          .get(
            String(req.params.id),
          )
          .then((form) =>
            res.json({ form }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "FORM_NOT_FOUND",
            ),
          );
      },
    );

    router.patch(
      "/forms/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        forms
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              fields: Array.isArray(
                body.fields,
              )
                ? (body.fields as FormField[])
                : undefined,
              confirmationMessage:
                optionalString(
                  body.confirmationMessage,
                ),
              notifyEmail:
                optionalString(
                  body.notifyEmail,
                ),
              createLead:
                body.createLead ==
                null
                  ? undefined
                  : Boolean(
                      body.createLead,
                    ),
              status:
                body.status ===
                "paused"
                  ? "paused"
                  : body.status ===
                      "active"
                    ? "active"
                    : undefined,
            },
          )
          .then((form) =>
            res.json({ form }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "FORM_NOT_FOUND",
            ),
          );
      },
    );

    router.get(
      "/forms/:id/submissions",
      (req, res, next) => {
        forms
          .listSubmissions(
            String(req.params.id),
          )
          .then((submissions) =>
            res.json({
              submissions,
            }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "FORM_NOT_FOUND",
            ),
          );
      },
    );
  }

  // ---- Files ----
  if (deps.files) {
    const files = deps.files;

    router.get(
      "/files",
      (req, res, next) => {
        files
          .list({
            subjectType:
              optionalString(
                req.query.subjectType,
              ),
            subjectId: optionalString(
              req.query.subjectId,
            ),
          })
          .then((rows) =>
            res.json({
              files: rows.map(
                publicFile,
              ),
            }),
          )
          .catch(next);
      },
    );

    router.get(
      "/files/usage",
      (_req, res, next) => {
        files
          .usage()
          .then((usage) =>
            res.json(usage),
          )
          .catch(next);
      },
    );

    router.post(
      "/files",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.name,
          ) ||
          !isNonEmptyString(
            body.data,
          ) ||
          !isNonEmptyString(
            body.mimeType,
          )
        ) {
          badRequest(
            res,
            "INVALID_FILE",
            "A file name, type, and contents are required.",
          );

          return;
        }

        files
          .upload({
            name: String(body.name),
            mimeType: String(
              body.mimeType,
            ),
            data: String(body.data),
            tags: Array.isArray(
              body.tags,
            )
              ? body.tags.map(String)
              : undefined,
            subjectType:
              optionalString(
                body.subjectType,
              ),
            subjectId: optionalString(
              body.subjectId,
            ),
            uploadedBy:
              actor(req).actorId,
          })
          .then((file) => {
            void deps.activity?.record({
              ...actor(req),
              type: "file.uploaded",
              subjectType:
                file.subjectType ||
                "file",
              subjectId:
                file.subjectId ||
                file.id,
              title: `File uploaded: ${file.name}`,
            });

            res
              .status(201)
              .json({
                file: publicFile(
                  file,
                ),
              });
          })
          .catch(
            (error: unknown) => {
              if (
                error instanceof
                FileQuotaError
              ) {
                res
                  .status(402)
                  .json({
                    error: {
                      code: "QUOTA_FULL",
                      message:
                        error.message,
                    },
                  });

                return;
              }

              if (
                error instanceof
                FileValidationError
              ) {
                badRequest(
                  res,
                  "INVALID_FILE",
                  error.message,
                );

                return;
              }

              next(error);
            },
          );
      },
    );

    router.get(
      "/files/:id/download",
      (req, res, next) => {
        files
          .download(
            String(req.params.id),
          )
          .then(({ file, data }) => {
            res.setHeader(
              "Content-Type",
              file.mimeType,
            );
            res.setHeader(
              "X-Content-Type-Options",
              "nosniff",
            );
            res.setHeader(
              "Content-Disposition",
              `attachment; filename="${file.name.replace(/["\\]/g, "")}"`,
            );
            res.send(data);
          })
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "FILE_NOT_FOUND",
            ),
          );
      },
    );

    router.post(
      "/files/:id/delete",
      (req, res, next) => {
        files
          .softDelete(
            String(req.params.id),
          )
          .then(() =>
            res.json({ ok: true }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "FILE_NOT_FOUND",
            ),
          );
      },
    );

    router.post(
      "/files/:id/restore",
      requireRole("owner", "admin"),
      (req, res, next) => {
        files
          .restore(
            String(req.params.id),
          )
          .then((file) =>
            res.json({
              file: publicFile(file),
            }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "FILE_NOT_FOUND",
            ),
          );
      },
    );
  }

  // ---- Audit log (owner/admin) ----
  if (deps.audit) {
    const audit = deps.audit;

    router.get(
      "/audit",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const limit =
          req.query.limit == null
            ? undefined
            : Number(req.query.limit);

        audit
          .list(limit)
          .then((events) =>
            res.json({ events }),
          )
          .catch(next);
      },
    );
  }

  // ---- Activity timeline ----
  if (deps.activity) {
    const activity = deps.activity;

    router.get(
      "/activity",
      (req, res, next) => {
        const subjectType =
          optionalString(
            req.query.subjectType,
          );
        const subjectId =
          optionalString(
            req.query.subjectId,
          );
        const limit =
          req.query.limit == null
            ? undefined
            : Number(req.query.limit);

        activity
          .list({
            subjectType,
            subjectId,
            limit,
          })
          .then((events) =>
            res.json({ events }),
          )
          .catch(next);
      },
    );
  }

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
          .then((user) => {
            deps.email?.sendQuietly({
              to: user.email,
              subject:
                "You've been added to a workspace",
              body: "You've been added to a workspace on the platform. Sign in with the temporary password you were given, then change it under Account.",
            });

            void deps.activity?.record({
              ...actor(req),
              type: "team.invited",
              subjectType: "team",
              subjectId: user.id,
              title: `Team member added: ${user.name || user.email}`,
              summary: `Role: ${user.role}`,
            });

            res.status(201).json({
              member:
                toPublicUser(user),
            });
          })
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
          .then((user) => {
            void deps.audit?.record({
              ...auditActor(req),
              action:
                "user.role_changed",
              targetType: "user",
              targetId: user.id,
              outcome: "success",
              ip: req.ip,
              metadata: {
                role: user.role,
              },
            });

            res.json({
              member:
                toPublicUser(user),
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
          .then(() => {
            void deps.audit?.record({
              ...auditActor(req),
              action: "user.removed",
              targetType: "user",
              targetId: id,
              outcome: "success",
              ip: req.ip,
            });

            res.json({ ok: true });
          })
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
        .then((client) => {
          void deps.activity?.record({
            ...actor(req),
            type: "client.created",
            subjectType: "client",
            subjectId: client.id,
            title: `Client added: ${client.name}`,
          });

          res
            .status(201)
            .json({ client });
        })
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
          .then((invoice) => {
            if (invoice.clientId) {
              void deps.activity?.record(
                {
                  ...actor(req),
                  type: "invoice.created",
                  subjectType: "client",
                  subjectId:
                    invoice.clientId,
                  title: `Invoice ${invoice.number} created`,
                  summary: `$${Number(invoice.amount || 0).toLocaleString()}`,
                },
              );
            }

            res
              .status(201)
              .json({ invoice });
          })
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
          .then((ticket) => {
            void deps.activity?.record({
              ...actor(req),
              type: "ticket.created",
              subjectType:
                ticket.clientId
                  ? "client"
                  : "ticket",
              subjectId:
                ticket.clientId ||
                ticket.id,
              title: `Ticket opened: ${ticket.subject}`,
              summary: ticket.priority
                ? `Priority: ${ticket.priority}`
                : undefined,
            });

            res
              .status(201)
              .json({ ticket });
          })
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
          .then((lead) => {
            // Fire any drip sequences triggered by a new lead. Best-effort:
            // the enrollment must never affect the lead-creation response.
            void deps.drip?.enrollByTrigger(
              "lead_created",
              lead.email,
              lead.name,
            );

            void deps.activity?.record({
              ...actor(req),
              type: "lead.created",
              subjectType: "lead",
              subjectId: lead.id,
              title: `Lead added: ${lead.name}`,
              summary: lead.company
                ? String(lead.company)
                : undefined,
            });

            res
              .status(201)
              .json({ lead });
          })
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
          .then((lead) => {
            if (
              isNonEmptyString(
                body.status,
              )
            ) {
              void deps.activity?.record(
                {
                  ...actor(req),
                  type: "lead.stage_changed",
                  subjectType: "lead",
                  subjectId: lead.id,
                  title: `Lead moved to ${lead.status}: ${lead.name}`,
                },
              );
            }

            res.json({ lead });
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

  // ---- Autoresponder / drip ----
  if (deps.drip) {
    const drip = deps.drip;

    // Sequences, each with its steps (for the dashboard).
    router.get(
      "/drip/sequences",
      (_req, res, next) => {
        drip
          .listSequences()
          .then((sequences) =>
            Promise.all(
              sequences.map((s) =>
                drip
                  .listSteps(s.id)
                  .then((steps) => ({
                    ...s,
                    steps,
                  })),
              ),
            ),
          )
          .then((sequences) =>
            res.json({ sequences }),
          )
          .catch(next);
      },
    );

    router.post(
      "/drip/sequences",
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
            "INVALID_SEQUENCE",
            "A sequence needs a name.",
          );

          return;
        }

        drip
          .createSequence({
            name: String(body.name),
            trigger: optionalString(
              body.trigger,
            ),
          })
          .then((sequence) =>
            res
              .status(201)
              .json({ sequence }),
          )
          .catch((error: unknown) =>
            validationOrNext(
              error,
              res,
              "INVALID_SEQUENCE",
              next,
            ),
          );
      },
    );

    // Pause / resume a sequence.
    router.post(
      "/drip/sequences/:id/status",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );
        const status =
          body.status === "paused"
            ? "paused"
            : body.status === "active"
              ? "active"
              : undefined;

        if (!status) {
          badRequest(
            res,
            "INVALID_STATUS",
            "Status must be active or paused.",
          );

          return;
        }

        drip
          .setStatus(
            String(req.params.id),
            status,
          )
          .then((sequence) =>
            res.json({ sequence }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "SEQUENCE_NOT_FOUND",
            ),
          );
      },
    );

    // Add a step to a sequence.
    router.post(
      "/drip/sequences/:id/steps",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.subject,
          ) ||
          !isNonEmptyString(body.body)
        ) {
          badRequest(
            res,
            "INVALID_STEP",
            "A step needs a subject and a body.",
          );

          return;
        }

        drip
          .addStep(
            String(req.params.id),
            {
              delayHours: Number(
                body.delayHours ?? 0,
              ),
              subject: String(
                body.subject,
              ),
              body: String(body.body),
            },
          )
          .then((step) =>
            res
              .status(201)
              .json({ step }),
          )
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";

            if (
              /not found/i.test(
                message,
              )
            ) {
              notFoundOrNext(
                res,
                next,
                error,
                "SEQUENCE_NOT_FOUND",
              );

              return;
            }

            validationOrNext(
              error,
              res,
              "INVALID_STEP",
              next,
            );
          });
      },
    );

    // Enroll a recipient manually.
    router.post(
      "/drip/sequences/:id/enroll",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(body.email)
        ) {
          badRequest(
            res,
            "INVALID_ENROLLMENT",
            "A recipient email is required.",
          );

          return;
        }

        drip
          .enroll(
            String(req.params.id),
            String(body.email),
            optionalString(body.name),
          )
          .then((enrollment) =>
            res
              .status(201)
              .json({ enrollment }),
          )
          .catch((error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "";

            if (
              /not found/i.test(
                message,
              )
            ) {
              notFoundOrNext(
                res,
                next,
                error,
                "SEQUENCE_NOT_FOUND",
              );

              return;
            }

            validationOrNext(
              error,
              res,
              "INVALID_ENROLLMENT",
              next,
            );
          });
      },
    );

    router.get(
      "/drip/enrollments",
      (_req, res, next) => {
        drip
          .listEnrollments()
          .then((enrollments) =>
            res.json({
              enrollments,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/drip/enrollments/:id/cancel",
      requireRole("owner", "admin"),
      (req, res, next) => {
        drip
          .cancelEnrollment(
            String(req.params.id),
          )
          .then((enrollment) =>
            res.json({ enrollment }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "ENROLLMENT_NOT_FOUND",
            ),
          );
      },
    );
  }

  // ---- Sales proposals ----
  if (deps.proposals) {
    const proposals = deps.proposals;

    router.get(
      "/proposals",
      (_req, res, next) => {
        proposals
          .list()
          .then((rows) =>
            res.json({
              proposals: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/proposals",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.title,
          )
        ) {
          badRequest(
            res,
            "INVALID_PROPOSAL",
            "A proposal needs a title.",
          );

          return;
        }

        proposals
          .create({
            title: String(
              body.title,
            ),
            summary: optionalString(
              body.summary,
            ),
            body: optionalString(
              body.body,
            ),
            amount:
              body.amount == null
                ? undefined
                : Number(
                    body.amount,
                  ),
            status: optionalString(
              body.status,
            ) as never,
            clientId: optionalString(
              body.clientId,
            ),
          })
          .then((proposal) =>
            res
              .status(201)
              .json({ proposal }),
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
      "/proposals/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        proposals
          .update(
            String(req.params.id),
            {
              title: optionalString(
                body.title,
              ),
              summary:
                optionalString(
                  body.summary,
                ),
              body: optionalString(
                body.body,
              ),
              amount:
                body.amount == null
                  ? undefined
                  : Number(
                      body.amount,
                    ),
              status:
                optionalString(
                  body.status,
                ) as never,
            },
          )
          .then((proposal) => {
            if (
              proposal.status ===
                "accepted" ||
              proposal.status ===
                "declined"
            ) {
              void deps.activity?.record(
                {
                  ...actor(req),
                  type: `proposal.${proposal.status}`,
                  subjectType:
                    proposal.clientId
                      ? "client"
                      : "proposal",
                  subjectId:
                    proposal.clientId ||
                    proposal.id,
                  title: `Proposal ${proposal.status}: ${proposal.title}`,
                  summary: proposal.amount
                    ? `$${Number(proposal.amount).toLocaleString()}`
                    : undefined,
                },
              );
            }

            res.json({ proposal });
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
                  .json({
                    error: {
                      code: "PROPOSAL_NOT_FOUND",
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
      "/proposals/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        proposals
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

  // ---- Products ----
  if (deps.products) {
    const products = deps.products;

    router.get(
      "/products",
      (_req, res, next) => {
        products
          .list()
          .then((rows) =>
            res.json({
              products: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/products",
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
            "INVALID_PRODUCT",
            "A product needs a name.",
          );

          return;
        }

        products
          .create({
            name: String(body.name),
            description:
              optionalString(
                body.description,
              ),
            status: optionalString(
              body.status,
            ) as never,
            repoUrl: optionalString(
              body.repoUrl,
            ),
            language:
              optionalString(
                body.language,
              ),
            version: optionalString(
              body.version,
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
          .then((product) =>
            res
              .status(201)
              .json({ product }),
          )
          .catch((error: unknown) =>
            clientOrNext(
              res,
              next,
              error,
            ),
          );
      },
    );

    router.patch(
      "/products/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        products
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              description:
                optionalString(
                  body.description,
                ),
              status:
                optionalString(
                  body.status,
                ) as never,
              repoUrl:
                optionalString(
                  body.repoUrl,
                ),
              language:
                optionalString(
                  body.language,
                ),
              version:
                optionalString(
                  body.version,
                ),
              owner: optionalString(
                body.owner,
              ),
              notes: optionalString(
                body.notes,
              ),
            },
          )
          .then((product) =>
            res.json({ product }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "PRODUCT_NOT_FOUND",
            ),
          );
      },
    );

    router.delete(
      "/products/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        products
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

  // ---- Books (publishing) ----
  if (deps.books) {
    const books = deps.books;

    router.get(
      "/books",
      (_req, res, next) => {
        books
          .list()
          .then((rows) =>
            res.json({
              books: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/books",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.title,
          )
        ) {
          badRequest(
            res,
            "INVALID_BOOK",
            "A book needs a title.",
          );

          return;
        }

        books
          .create({
            title: String(
              body.title,
            ),
            subtitle:
              optionalString(
                body.subtitle,
              ),
            author: optionalString(
              body.author,
            ),
            status: optionalString(
              body.status,
            ) as never,
            format: optionalString(
              body.format,
            ),
            isbn: optionalString(
              body.isbn,
            ),
            notes: optionalString(
              body.notes,
            ),
            clientId: optionalString(
              body.clientId,
            ),
          })
          .then((book) =>
            res
              .status(201)
              .json({ book }),
          )
          .catch((error: unknown) =>
            clientOrNext(
              res,
              next,
              error,
            ),
          );
      },
    );

    router.patch(
      "/books/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        books
          .update(
            String(req.params.id),
            {
              title: optionalString(
                body.title,
              ),
              subtitle:
                optionalString(
                  body.subtitle,
                ),
              author:
                optionalString(
                  body.author,
                ),
              status:
                optionalString(
                  body.status,
                ) as never,
              format:
                optionalString(
                  body.format,
                ),
              isbn: optionalString(
                body.isbn,
              ),
              notes: optionalString(
                body.notes,
              ),
            },
          )
          .then((book) =>
            res.json({ book }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "BOOK_NOT_FOUND",
            ),
          );
      },
    );

    router.delete(
      "/books/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        books
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

  // ---- Programs ----
  if (deps.programs) {
    const programs = deps.programs;

    router.get(
      "/programs",
      (_req, res, next) => {
        programs
          .list()
          .then((rows) =>
            res.json({
              programs: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/programs",
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
            "INVALID_PROGRAM",
            "A program needs a name.",
          );

          return;
        }

        programs
          .create({
            name: String(body.name),
            category:
              optionalString(
                body.category,
              ),
            status: optionalString(
              body.status,
            ) as never,
            leader: optionalString(
              body.leader,
            ),
            schedule:
              optionalString(
                body.schedule,
              ),
            description:
              optionalString(
                body.description,
              ),
            notes: optionalString(
              body.notes,
            ),
            clientId: optionalString(
              body.clientId,
            ),
          })
          .then((program) =>
            res
              .status(201)
              .json({ program }),
          )
          .catch((error: unknown) =>
            clientOrNext(
              res,
              next,
              error,
            ),
          );
      },
    );

    router.patch(
      "/programs/:id",
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        programs
          .update(
            String(req.params.id),
            {
              name: optionalString(
                body.name,
              ),
              category:
                optionalString(
                  body.category,
                ),
              status:
                optionalString(
                  body.status,
                ) as never,
              leader:
                optionalString(
                  body.leader,
                ),
              schedule:
                optionalString(
                  body.schedule,
                ),
              description:
                optionalString(
                  body.description,
                ),
              notes: optionalString(
                body.notes,
              ),
            },
          )
          .then((program) =>
            res.json({ program }),
          )
          .catch((error: unknown) =>
            notFoundOrNext(
              res,
              next,
              error,
              "PROGRAM_NOT_FOUND",
            ),
          );
      },
    );

    router.delete(
      "/programs/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        programs
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

  // ---- Email (outbox + send) ----
  if (deps.email) {
    const email = deps.email;

    router.get(
      "/emails",
      requireRole("owner", "admin"),
      (_req, res, next) => {
        email
          .list()
          .then((rows) =>
            res.json({
              connected:
                email.connected(),
              emails: rows,
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/emails",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.to,
          ) ||
          !isNonEmptyString(
            body.subject,
          ) ||
          !isNonEmptyString(
            body.body,
          )
        ) {
          badRequest(
            res,
            "INVALID_EMAIL",
            "A recipient, subject, and body are required.",
          );

          return;
        }

        email
          .send({
            to: String(body.to),
            subject: String(
              body.subject,
            ),
            body: String(body.body),
          })
          .then((record) =>
            res
              .status(201)
              .json({ email: record }),
          )
          .catch(
            (error: unknown) => {
              const message =
                error instanceof
                Error
                  ? error.message
                  : "";

              if (
                /valid recipient/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_EMAIL",
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

  // ---- Client portal logins (owner/admin manage) ----
  if (deps.clientUsers) {
    const clientUsers =
      deps.clientUsers;

    router.get(
      "/portal-users",
      requireRole("owner", "admin"),
      (_req, res, next) => {
        clientUsers
          .list()
          .then((rows) =>
            res.json({
              portalUsers: rows.map(
                toPublicClientUser,
              ),
            }),
          )
          .catch(next);
      },
    );

    router.post(
      "/portal-users",
      requireRole("owner", "admin"),
      (req, res, next) => {
        const body = asObject(
          req.body,
        );

        if (
          !isNonEmptyString(
            body.clientId,
          ) ||
          !isNonEmptyString(
            body.email,
          ) ||
          !isNonEmptyString(
            body.password,
          )
        ) {
          badRequest(
            res,
            "INVALID_PORTAL_USER",
            "A client, email, and password (8+ chars) are required.",
          );

          return;
        }

        clientUsers
          .create({
            clientId: String(
              body.clientId,
            ),
            email: String(
              body.email,
            ),
            password: String(
              body.password,
            ),
          })
          .then((user) => {
            deps.email?.sendQuietly({
              to: user.email,
              subject:
                "Your client portal login is ready",
              body: "A portal login has been created for you. Visit /portal and sign in with the temporary password you were given, then change it.",
            });

            res.status(201).json({
              portalUser:
                toPublicClientUser(
                  user,
                ),
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

              if (
                /valid email|at least 8/i.test(
                  message,
                )
              ) {
                badRequest(
                  res,
                  "INVALID_PORTAL_USER",
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
      "/portal-users/:id",
      requireRole("owner", "admin"),
      (req, res, next) => {
        clientUsers
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
          .then((website) => {
            void deps.activity?.record({
              ...actor(req),
              type: "website.published",
              subjectType: "website",
              subjectId: website.id,
              title: `Website published: ${website.name}`,
              summary: `Live on ${domain}`,
              metadata: { domain },
            });

            res.json({
              website:
                websiteSummary(
                  website,
                ),
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

/**
 * Derives the acting user for an activity event from the authenticated
 * request. Always a team member here (this router is behind requireUser).
 */
function actor(req: unknown): {
  actorType: "user";
  actorId?: string;
  actorName?: string;
} {
  const auth = (req as AuthedRequest)
    .auth;

  return {
    actorType: "user",
    actorId: auth?.user.id,
    actorName:
      auth?.user.name ||
      auth?.user.email,
  };
}

/**
 * The client-safe shape of a file — omits the internal storage key.
 */
function publicFile(
  file: PlatformFileRecord,
): Record<string, unknown> {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    tags: file.tags,
    subjectType: file.subjectType,
    subjectId: file.subjectId,
    uploadedBy: file.uploadedBy,
    createdAt: file.createdAt,
  };
}

/**
 * Audit actor fields from the authenticated request (uses `actorLabel`, the
 * shape the audit service expects).
 */
function auditActor(req: unknown): {
  actorType: "user";
  actorId?: string;
  actorLabel?: string;
} {
  const auth = (req as AuthedRequest)
    .auth;

  return {
    actorType: "user",
    actorId: auth?.user.id,
    actorLabel:
      auth?.user.name ||
      auth?.user.email,
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

/** Maps a "client not found" error to 400 UNKNOWN_CLIENT, else passes on. */
function clientOrNext(
  res: Response,
  next: NextFunction,
  error: unknown,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (
    /client not found/i.test(message)
  ) {
    badRequest(
      res,
      "UNKNOWN_CLIENT",
      "That client isn't in your organization.",
    );

    return;
  }

  next(error);
}

/** Maps a "not found" error to 404 with `code`, else passes on. */
function notFoundOrNext(
  res: Response,
  next: NextFunction,
  error: unknown,
  code: string,
): void {
  const message =
    error instanceof Error
      ? error.message
      : "";

  if (/not found/i.test(message)) {
    res
      .status(404)
      .json({
        error: { code, message },
      });

    return;
  }

  next(error);
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
    /required|not found|line item|valid|at least|must be|needs a/i.test(
      message,
    )
  ) {
    badRequest(res, code, message);
    return;
  }

  next(error);
}
