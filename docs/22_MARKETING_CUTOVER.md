# Marketing delivery cutover & rollback (S7b-v)

The platform has TWO marketing delivery paths that must never run at once:

- **legacy** — `DripService.runDue/processOne` sends drip steps directly (no
  unsubscribe headers, no metering). Historical behaviour.
- **outbox** — the safeguarded `MarketingWorker` sends via `marketing_outbox`
  (consent/suppression/limits/pause/metering/unsubscribe), fed by activation +
  the migration reconciliation.

Exactly one is authoritative, selected by a **single** environment value,
`MARKETING_DELIVERY_MODE ∈ {disabled | legacy | outbox}` (resolved by
`resolveMarketingDeliveryMode`). There are no independent booleans, so the two
paths are mutually exclusive by construction:

| Mode | Legacy drip send | Legacy auto-enroll (`enrollByTrigger`) | Outbox marketing | Activation→outbox | Confirmation (transactional) |
|---|---|---|---|---|---|
| `disabled` | refuses | refuses | refuses | off | **runs** |
| `legacy` | **runs** | **runs** | refuses | off | **runs** |
| `outbox` | refuses | refuses | **runs** | on | **runs** |

- **Missing, empty, or unrecognized → `disabled`** — resolution ALWAYS fails
  closed. Marketing sending requires an EXPLICIT, recognized mode, so a missing
  `MARKETING_DELIVERY_MODE` can never silently enable the legacy path on a new
  deployment, a restored server, a test environment, or a future instance. A
  loud startup banner reports the failed-closed state. `legacy` is set ONLY when
  an operator deliberately preserves existing behaviour during the staged
  transition; `outbox` is set deliberately at the final cutover. **Neither mode
  is ever inferred.** Startup logs the active mode; `/system-health` exposes
  `marketingDeliveryMode`. Tests never start the worker (no timers in
  `createPlatformApp`; the worker lives only in `platformServer`).
- **Transactional email is never gated by mode** — account verification, password
  reset, privacy, security, and the double-opt-in **confirmation dispatch** work
  in every mode.

> Nothing in this document is executed now. It is the controlled procedure for a
> **future** operator-run cutover. **Do not deploy or run the cutover here.**

## Controlled production transition (future, operator-run)

1. **Backup** the database and application (see the deployment runbook; snapshot
   the DB and the app directory).
2. **Confirm one process and set the mode deliberately.** Verify a single app
   process is running and read the active mode from the startup banner /
   `/system-health`. Because resolution fails closed, an unset variable reports
   `disabled`. Preflight must **explicitly inspect the current production state**
   (are there active legacy enrollments still being served?) and, only when
   deliberately preserving existing behaviour during the staged transition, set
   `MARKETING_DELIVERY_MODE=legacy` and restart. Never rely on an inferred
   default.
3. **Pause legacy marketing claims.** Set `MARKETING_DELIVERY_MODE=disabled` and
   restart the single process. Legacy `runDue` now refuses; confirmation +
   transactional continue. (Alternatively pause per-tenant via the ops routes.)
4. **Let bounded in-flight legacy sends finish or classify them.** Legacy
   `sendQuietly` is fire-and-forget; after step 3 no new legacy sends start.
   Allow any in-progress tick to complete; there is no long-held lease on the
   legacy path.
5. **Dry-run reconciliation.** Run `MarketingEnrollmentReconciliation.reconcile({
   dryRun: true })`. Review the counts + enrollment ids (no PII): `seeded`
   (would-seed the next unsent step), `alreadySeeded`, `skipped*`,
   `needsAttention`, `completed`.
6. **Review ambiguous records.** Investigate every `needsAttention` id
   (missing/paused sequence, error marker, stepIndex past end) before proceeding.
   Resolve or intentionally exclude them.
7. **Run the idempotent migration.** `reconcile({ dryRun: false })`. It seeds ONLY
   the next genuinely-unsent step per enrollment, idempotent on
   `(enrollment_id, step_index)` — re-running is safe and never duplicates.
8. **Set the single mode to `outbox`.** `MARKETING_DELIVERY_MODE=outbox`.
9. **Start exactly one worker.** Restart the single process. The worker now runs
   marketing via the outbox; legacy `runDue`/`enrollByTrigger` refuse.
10. **Verify** via `/system-health` + the ops routes: mode = `outbox`,
    transactional priority intact (confirmation still sending), queue health
    (needs-attention set), sender configuration resolves, suppression enforced,
    limits (hourly/daily/concurrency) present, metering advancing on `sent`.
11. **Send only explicitly approved test messages** (the owner/admin
    marketing-sender test route) — do NOT open normal volume yet.
12. **Observe** delivery, bounce/complaint signals, and the auto-pause counters
    for a defined window before enabling normal volume.

## Rollback safety

Rolling application code back to a legacy build AFTER outbox messages have begun
sending can create **duplicates** (legacy would resend steps the outbox already
sent). Enforce:

1. **Emergency rollback sets marketing mode to `disabled` FIRST**
   (`MARKETING_DELIVERY_MODE=disabled`, restart). This immediately stops ALL
   marketing sending on both paths while preserving transactional email.
2. **Preserve all state.** Never drop/delete `marketing_outbox`,
   `marketing_outbox_attempts`, `drip_enrollments`, `marketing_send_meter`,
   `marketing_pause`, `marketing_activations`, or `confirmation_dispatch`. An
   application rollback must **not** delete these additive tables (they are
   `CREATE TABLE IF NOT EXISTS`; older code simply ignores them).
3. **Never auto-restart legacy sending.** Do not set mode back to `legacy`
   automatically. Legacy resumes only after a human reconciles what the outbox
   already sent vs. what remains (compare `marketing_outbox` `sent`/
   `delivery_unknown` against enrollment `stepIndex`).
4. **Reconcile before choosing a mode.** After real outbox delivery has begun,
   the safe direction is **forward-fix** (stay on `outbox`, resolve issues via
   the ops routes), not a legacy rollback, precisely because of duplicate risk.
5. **`delivery_unknown` stays manual-review only** — never auto-resent in any
   mode; owner/admin resolve/retry(with duplicate ack)/cancel via the ops routes.
6. **Additive-only schema.** Every table above is additive; a code rollback keeps
   the data intact for a later forward-fix.

## Zero-enrollment preflight

If production has **zero active legacy enrollments** at cutover time, verify that
read-only during preflight (`reconcile({ dryRun: true })` → `scanned: 0`); the
migration is then a no-op. The migration tests still cover the nonzero cases so
the path is proven regardless.

## Acceptance gate

The autoresponder is **not** "operational" until: marketing uses the outbox
exclusively; the outbox worker can be safely enabled (`MARKETING_DELIVERY_MODE=
outbox`, one process); the legacy path cannot send concurrently (proven by the
mode-gating tests); and the migration/cutover + rollback procedures above are
proven (reconciliation tests + this document). These are preconditions for the
consolidated pre-deployment report.
