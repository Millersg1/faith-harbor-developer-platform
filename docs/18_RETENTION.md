# Data Retention & Purge

This document records All Elite Cloud's data-retention matrix and what is
**enforced in code** versus **operational policy** (manual or provider-level).
It backs the retention section of the Privacy Policy. Keep this file and the
Privacy Policy in sync — do not state a period in the Privacy Policy that is not
either enforced here or a genuine operational commitment.

## Enforced in code

| Data | Policy | Enforcement |
|---|---|---|
| Deleted files (soft-deleted content) | Recoverable up to 30 days, then purged from the active DB (bytes + row) | `RetentionService.purgeDeletedFiles` runs on a schedule (`RETENTION_TICK_MS`, default 24h; window `RETENTION_FILE_DAYS`, default 30). Purges bytes via the storage provider and the metadata row, per organization, skipping any org under a legal hold, and writes a `retention.files_purged` audit event (count only). |
| Password-reset / verification tokens | Never usable past expiry | 1-hour TTL, single-use, hash-only storage (`PasswordResetService`). |
| Sessions | Removed per session lifecycle | Validated-and-deleted on expiry (`PlatformSessionService`). |
| Legal holds | While a hold exists for an org, nothing is purged for it | `legal_holds` table; `RetentionService` skips held orgs entirely. |

## Operational policy (not yet a scheduled code job)

These are the owner's committed retention periods. They are honored
operationally and/or at the infrastructure level; a scheduled purge job for each
is future work. Do not represent them in the Privacy Policy as automated beyond
what is true.

| Data | Policy | Status |
|---|---|---|
| Active account / operational data | Retained while the account is active | Inherent. |
| Closed-account operational content | Purged within 30 days of closure | **Requires an account-closure flow** (a `closedAt` timestamp does not exist today; org delete cascades DB rows but not file bytes). Implement closure + reuse `RetentionService` before claiming this as automated. |
| Billing / tax / accounting records | Up to 7 years | Operational; Stripe holds transaction records. |
| Legal-acceptance records | Account relationship + up to 7 years | Append-only `legal_acceptances`; no auto-purge job yet. |
| Security / audit logs | 12 months (longer under investigation/hold) | `audit_events` append-only; no auto-purge job yet. |
| Support records | 24 months after closure | No auto-purge job yet. |
| Privacy-request records | 3 years | No auto-purge job yet. |
| Backups | Deleted data persists in backups until they age out on their normal rotation; restored only for disaster recovery | **Verify the actual backup rotation with the hosting provider (CloudSouth) and state the real schedule.** |

## Legal holds

Insert a row into `legal_holds (organization_id, reason, created_at)` to place an
organization under hold; the retention purge will skip it entirely until the row
is removed. (A management UI for holds is future work; today it is a direct DB
operation for staff.)

## Verify before publishing the Privacy Policy

- Confirm the deleted-file purge is running in production (check `[retention]`
  logs / audit events).
- Confirm the real backup rotation and update the Privacy Policy's backup line.
- Decide whether the closed-account and per-class purge jobs are required before
  publication, or whether the operational commitments above are acceptable to
  counsel.
