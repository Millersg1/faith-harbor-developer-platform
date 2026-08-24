# 38 — Domain Operations Monitoring & Runbook

Credential-free lifecycle-completion release. This runbook documents the PII-free
operational health surface for the domain-registration subsystem, its alert
thresholds, and the response procedure for each alert. **No real notification
service is wired** — thresholds are computed and returned by the health snapshot;
wiring them to a pager/Slack is a follow-up. Everything here is read-only and
sandbox-safe.

## Where the signal comes from

`GET /platform/admin/api/domain-ops/health` (platform-admin session only) returns
a `DomainOpsHealthSnapshot`. It is assembled by `DomainOpsHealthService` from:

- the redacted cross-tenant support-queue counts (`SupportQueueReader.counts`),
- coarse notice-outbox depth by status + oldest-open age (`PgDomainHealthReader`),
- the worker coordinator health (`DomainWorkerCoordinator.health()`), and
- the resolved operations mode + coarse disabled reason.

**The snapshot is strictly PII-free.** It contains only coarse counts, coarse
states, timestamps, a derived age (seconds), the mode enum, and a coarse
disabled-reason enum. It NEVER contains a domain name, email, contact, EPP code,
Stripe id, provider message, price, key, or token. A regression test asserts the
serialized snapshot matches none of `@`, `.com`, `sk_`, `epp`.

## Snapshot fields

| Field | Meaning |
|---|---|
| `mode` | `disabled` \| `reconcile_only` \| `full` (fail-closed default `disabled`) |
| `running` | whether the worker coordinator is ticking |
| `disabledReason` | coarse enum when disabled (e.g. `disabled_by_configuration`), else `null` |
| `workers` | coordinator health: last tick time/age, tick count, PII-free per-pass counts, `lastReason` (`ok`\|`tick_error`\|`never_run`) |
| `queue` | per-category open counts (the 10 support categories) |
| `unknownsTotal` | sum of `registration_unknown` + `renewal_unknown` + `transfer_unknown` + `delivery_unknown` |
| `noticesByState` | notice-outbox depth grouped by coarse status |
| `oldestOpenNoticeAgeSeconds` | age of the oldest still-open (queued / retrying / sending) notice, or `null` |
| `alerts` | the threshold breaches below, each `{key, severity, value, threshold}` |

## Alert thresholds & response

Thresholds live in `DEFAULT_HEALTH_THRESHOLDS` (overridable per deploy). Response
procedures are **read-only reconciliation first**; no blind retry — the support
queue enforces that any resolution is preceded by a logged reconciliation.

| Alert key | Severity | Fires when | First response |
|---|---|---|---|
| `unknowns` | warning | `unknownsTotal ≥ 1` | Open the support queue, filter each `*_unknown` category. For each item, reconcile READ-ONLY with the provider (did the registration/renewal/transfer actually happen? was the notice accepted?). Record the finding. Only then resolve. Never blindly re-run the operation. |
| `needs_attention` | warning | `needs_attention ≥ 1` | Usually a wrong-amount webhook or a DNS provisioning that came back `needs_attention`. Reconcile the order/DNS state read-only; route to the owner if owner action is required (support cannot change contacts/NS/privacy). |
| `stale_sync` | warning | `stale_sync ≥ 5` | Provider sync has been failing for ≥5 registrations. Check provider reachability / rate-limit budgets. Confirmed facts are preserved and marked stale — do NOT trust cached facts while stale; the sync scanner will self-heal when the provider recovers. |
| `refund_failure` | **critical** | `refund_failure ≥ 1` | A refund is stuck `failed`/`unknown`. This is money owed to a customer. Reconcile the Stripe charge/refund state read-only; if the refund genuinely did not issue, escalate to a human with Stripe access. Do NOT blind-retry from the queue. |
| `stuck_lease` | warning | `stuck_lease ≥ 1` | A worker lease outlived its window (likely a crashed worker). The scanners' `recoverExpired*` passes re-queue these automatically on the next tick; if the count does not drain, check the worker process/`lastReason=tick_error`. |
| `oldest_open_notice` | warning | oldest open notice age ≥ 24h | Notices are not draining. In this release delivery is a captured no-send + the recipient resolver returns `null`, so notices are intentionally re-queued (kept alive) until a real transport is wired — expected while sending is disabled. Once delivery is enabled, a growing age means the notice worker is not running (`full` mode) or the transport is failing. |
| `worker_tick_error` | warning | coordinator `lastReason === "tick_error"` | The last coordinator tick threw. Ticks are lease-guarded and retry on the next interval; inspect logs. Persistent errors mean a systemic fault (DB down, migration mismatch). |

## Operating modes (fail-closed)

- `disabled` (default): nothing domain-related runs. Expected in production until
  explicitly enabled. `disabledReason` explains it.
- `reconcile_only`: read-only reconciliation + read-only scanners (lifecycle,
  provider sync) only. No submission, no refund issuance, no auto-renew charge.
- `full`: every pass, including the auto-renew scheduler and the notice worker
  (captured transport — still sends no real email in this release).

## Abuse controls (context)

The tenant domain endpoints (search/availability/price, DNS preview, SetupIntent
+ auto-renew setup/confirm, transfer unlock/auth-code/incoming, unknown-state
resolve) are rate-limited per IP / user / tenant / platform via token buckets. A
throttled request returns a fixed generic `429 RATE_LIMITED` with a coarse
`Retry-After` and is **existence-agnostic** — it is decided before any lookup, so
it cannot be used to probe whether a domain/order/contact exists. A spike of 429s
is not in the health snapshot (it is per-process); watch the access logs.

## What is deliberately NOT here

No real pager/email/Slack notification, no domain names or customer identifiers in
any metric, no provider transcripts. Wiring the alerts to a real notifier, and
enabling real notice delivery, are separate follow-ups gated on their own
approvals.
