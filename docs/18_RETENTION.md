# Data Retention Coverage Matrix

This is the authoritative record of what retention behavior is **enforced in
code** versus **operational/manual** for every material data class in the All
Elite Cloud platform. The Privacy Policy must describe only what this document
supports as actual behavior.

Legend — **Soft-delete**: does a delete mark a row recoverable? **Final purge**:
is there code that removes it permanently? **Worker**: scheduled vs manual.
**Cascade**: removed when the org row is deleted (`ON DELETE CASCADE`)?
**Legal hold**: honored by an automated purge? **Backup**: see note [B].

## Enforced by code

| Data class (table) | Active rule | Soft-delete | Recoverable | Final purge mechanism | Worker | Cascade | Legal hold | Audit | Tests |
|---|---|---|---|---|---|---|---|---|---|
| Uploaded files (`files`) | Kept while account active | Yes (`deleted_at`) | Up to 30 days | `RetentionService.purgeDeletedFiles` deletes stored bytes + row | Scheduled (`RETENTION_TICK_MS`, default 24h; window `RETENTION_FILE_DAYS`=30) | Yes (row); bytes removed by purge | Yes — held orgs skipped | `retention.files_purged` (count only) | `RetentionService.test.ts` (3) |
| Password-reset / verification tokens | N/A | No | No | 1-hour expiry, single-use, hash-only; unusable after expiry | On-use / on-expiry | Yes | N/A | Security audit on reset | existing auth tests |
| Sessions (`platform_sessions`, `platform_admin_sessions`, `portal_sessions`) | Valid until expiry | No | No | Expired sessions deleted on validation | On-access | Yes | N/A | login/session tests |
| Legal holds (`legal_holds`) | Present = org exempt from purge | No | N/A | Removed by staff to lift the hold | Manual | Yes | — | `RetentionService.test.ts` |

## Operational / manual (no scheduled purge job today)

These are retained while the account is active and removed on account deletion
(DB cascade) or on a verified deletion request. There is **no per-class
scheduled purge**; do not state specific automated periods for these in the
Privacy Policy.

| Data class (tables) | Active rule | Soft-delete | Final purge mechanism | Worker | Cascade | Notes |
|---|---|---|---|---|---|---|
| Account & team (`organizations`, `platform_users`) | While active | No | Org delete removes rows | Manual | Root/Yes | Org delete cascades all tenant rows |
| Branding (`organization_branding`) | While active | No | Cascade on org delete | Manual | Yes | |
| CRM & work (`clients`, `leads`, `projects`, `invoices`, `proposals`, `products`, `books`, `programs`, `support_tickets`, `websites`, `campaigns`, `reviews`, `brands`) | While active | Mixed | Cascade on org delete | Manual | Yes | Bytes for `websites` are DB `html` (no separate store) |
| Files metadata (`files`) | see enforced table | Yes | 30-day purge (enforced) | Scheduled | Yes | Only class with an automated purge |
| AI data (`organization_ai_settings`, `ai_usage_events`, `ai_conversations`, `ai_conversation_messages`) | While active | No | Cascade on org delete | Manual | Yes | BYO key stored write-only/masked |
| Knowledge base (`knowledge_*`), forms (`forms`), calendar, notifications, drip (`drip_*`), portal (`portal_users`) | While active | No | Cascade on org delete | Manual | Yes | |
| Custom domains (`organization_domains`) | While connected | No | Cascade on org delete | Manual | Yes | |
| Audit & activity logs (`audit_events`, `activity_events`) | While active | No (append-only) | Cascade on org delete | Manual | Yes | Owner target 12 months — **not yet an automated job** |
| Support records (tickets) | While active | No | Cascade on org delete | Manual | Yes | Owner target 24 months — **not yet automated** |
| Billing (`organization_subscriptions`, `stripe_processed_events`) | While active | No | Cascade on org delete; Stripe holds txn records | Manual | Yes | Owner target 7 years for tax — held by Stripe + accounting |
| Legal acceptance (`legal_acceptances`) | Account relationship | No (append-only) | Cascade on org delete | Manual | Yes | Owner target ≤7 years — **not yet automated** |
| Privacy requests (`privacy_requests`) | Fulfillment evidence | No | Manual | Manual | Nullable org | Owner target 3 years — **not yet automated** |
| Platform legal docs (`platform_legal_documents`) | Retained (versioned, immutable) | No | Kept as legal record | Manual | Global | Not tenant data |

## Gaps to close before broader retention claims

1. **Closed-account 30-day purge** — needs an account-closure flow. Today there
   is no `closedAt` (org status: `active`/`suspended`/`cancelled`), and org
   *delete* cascades DB rows but does **not** delete stored file bytes. To claim
   "purged within 30 days of closure," add a closure timestamp and route closed
   orgs' files through `RetentionService`.
2. **Per-class scheduled purges** (audit 12mo, support 24mo, privacy-request
   3y, acceptance ≤7y) — not implemented. Either implement + test, or keep the
   Privacy Policy's general "retained while active / as required by law /
   deletion on request" language (current wording).
3. **Backup rotation [B]** — the actual backup schedule, access controls, and
   whether backups are encrypted at rest are **not verifiable from the
   codebase**. The Privacy Policy therefore says only that deleted data may
   remain in *access-restricted* backups until they expire on the normal
   schedule (no "encrypted" claim). Verify the real schedule with the hosting
   provider before making any stronger statement.

## Legal holds

Insert a row into `legal_holds (organization_id, reason, created_at)` to exempt
an organization from automated purges; remove it to lift the hold. A management
UI is future work; today it is a staff DB operation.
