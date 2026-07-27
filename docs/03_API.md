# 03 — API

JSON over HTTP. Base for the tenant API is `/api/platform`. All responses use
`{ error: { code, message } }` on failure. Success shapes are noted per route.

## Authentication & surfaces

- **Tenant API** `/api/platform/*` — requires the `aec_session` cookie
  (`requireUser`) and runs in the caller's tenant scope. Mutating routes may
  additionally require a role (`owner`/`admin`).
- **Auth** `/auth/*` — signup, login (tenant-resolved via `X-Org-Slug` header
  or subdomain), logout, `/me`, change-password, forgot-password,
  reset-password.
- **Admin API** `/platform/admin/api/*` — requires `aec_admin`.
- **Portal API** `/portal/api/*` — requires `aec_portal`; scoped to the
  client.
- **Public** (no auth): `POST /api/public/forms/:slug/submit`, `GET /f/:slug`,
  `POST /webhooks/stripe` (raw-body, signature-verified).

Unauthenticated tenant-API calls return **401**; unknown routes **404**;
validation failures **400**; plan/quota limits **402**.

## Auth routes

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | /auth/signup | public | organizationName, email, password, [slug,name] | creates org+owner, logs in |
| POST | /auth/login | tenant (X-Org-Slug) | email, password | sets cookie |
| POST | /auth/logout | cookie | — | revokes session |
| GET | /auth/me | requireUser | — | user + org |
| POST | /auth/change-password | requireUser | currentPassword, newPassword | |
| POST | /auth/forgot-password | tenant | email | always 200 (no enumeration) |
| POST | /auth/reset-password | tenant | token, newPassword | single-use, 1h |

## Tenant API — platform features

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /api/platform/notifications | user | list + unreadCount |
| GET | /api/platform/notifications/unread-count | user | badge poll |
| POST | /api/platform/notifications/:id/read | user | mark read |
| POST | /api/platform/notifications/read-all | user | mark all |
| GET | /api/platform/activity | user | timeline (?subjectType&subjectId&limit) |
| GET | /api/platform/search?q= | user | grouped universal search |
| GET | /api/platform/files | user | list |
| GET | /api/platform/files/usage | user | {usedBytes,quotaBytes} |
| POST | /api/platform/files | user | upload {name,mimeType,data(base64)} |
| GET | /api/platform/files/:id/download | user | bytes (attachment, nosniff) |
| POST | /api/platform/files/:id/delete | user | soft delete |
| POST | /api/platform/files/:id/restore | owner/admin | restore |
| GET/POST | /api/platform/forms | list / owner+admin create | |
| GET/PATCH | /api/platform/forms/:id | get / owner+admin update | |
| GET | /api/platform/forms/:id/submissions | user | submissions |
| GET/POST/PATCH/DELETE | /api/platform/calendar/events | user (create/patch/delete) | list ?from&to |
| GET/POST | /api/platform/knowledge/collections | list / owner+admin create | |
| GET/POST | /api/platform/knowledge/collections/:id/documents | list / owner+admin add | |
| DELETE | /api/platform/knowledge/documents/:id | owner/admin | delete + chunks |
| POST | /api/platform/knowledge/collections/:id/query | user | {question} → {chunks,citations} |
| GET/POST | /api/platform/drip/sequences | list / owner+admin | |
| POST | /api/platform/drip/sequences/:id/steps,/status,/enroll | owner/admin | |
| GET | /api/platform/drip/enrollments | user | |
| POST | /api/platform/emails | owner/admin | send + outbox |
| GET | /api/platform/emails | owner/admin | outbox + connected flag |
| GET/POST | /api/platform/workflows | list / owner+admin create | {name,trigger,steps[]} |
| PATCH | /api/platform/workflows/:id | owner/admin | name/trigger/status/steps |
| GET | /api/platform/workflows/:id/runs | user | run history + step log |
| GET | /api/platform/ai/tools | user | tools the caller's role may use |
| POST | /api/platform/ai/tools/:name/invoke | user | read → 200 executed; write → 202 pending |
| GET | /api/platform/ai/tools/invocations | user | recent invocations + pending |
| POST | /api/platform/ai/tools/invocations/:id/confirm | owner/admin | run a pending write |
| POST | /api/platform/ai/tools/invocations/:id/reject | owner/admin | decline a pending write |
| POST | /api/platform/ai/console/chat | user | {message,history[],employeeId?} → {available,reply,steps[],pending[]} |
| GET | /api/platform/marketplace/website-templates | user | code-defined template catalogue |
| POST | /api/platform/marketplace/website-templates/:id/use | owner/admin | create a seeded website draft (402 if site limit hit) |
| GET/POST | /api/platform/ai/employees | list / owner+admin create | {name,title,persona,toolNames[]} |
| PATCH/DELETE | /api/platform/ai/employees/:id | owner/admin | update / remove |

## Tenant API — business modules

Standard REST per module: `GET /x` (list), `POST /x` (create), `PATCH /x/:id`,
`DELETE /x/:id` (owner/admin) for: clients, projects, invoices, tickets, leads,
proposals, campaigns, reviews, brands, products, books, programs, hosting,
domains, websites, team, portal users, billing/plans, ai-settings, ai-usage.
`PATCH /api/platform/invoices/:id` (owner/admin) also marks an invoice paid and
emits `invoice.paid` on the transition into paid.

## Public routes

| Method | Path | Notes |
|---|---|---|
| GET | /f/:slug | renders the public form page |
| POST | /api/public/forms/:slug/submit | body `{data:{…}}`; 400 invalid, 404 unknown/paused |
| POST | /webhooks/stripe | raw body; signature verified before trust |

## Validation & errors

Bodies validated in the API layer (required fields) and again in services
(business rules). Error codes are stable slugs (`INVALID_FORM`,
`FORM_NOT_FOUND`, `QUOTA_FULL`, `PLAN_LIMIT`, `INVALID_RESET`, …).

## Rate limits

Not yet implemented (outstanding hardening item — login throttling + API rate
limits). See `04_SECURITY.md` and `05_PRODUCT_ROADMAP.md`.

## Examples

```
# Create a form (owner/admin)
POST /api/platform/forms   Cookie: aec_session=…
{ "name":"Contact us", "fields":[{"key":"email","type":"email","label":"Email","required":true}] }
→ 201 { "form": { "id":"…", "slug":"contact-us-ab12cd34", … } }

# Public submission
POST /api/public/forms/contact-us-ab12cd34/submit
{ "data": { "email":"a@b.com" } }
→ 200 { "confirmationMessage":"Thanks — we got your submission." }
```
