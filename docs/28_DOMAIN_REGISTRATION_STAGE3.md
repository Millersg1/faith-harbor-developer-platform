# Domain Registration — Stage 3 Report (additive schema + encryption model)

**No production database, environment, domain, DNS, payment, refund, email,
credential, or provider object was changed.** All work is on branch
`feature/domain-registration`, not wired into the running app, live purchasing
disabled. The real-PostgreSQL validation ran in a **disposable isolated schema**
and left production's `public` schema **unchanged (74 tables)**.

## Commits

- **Stage 2 corrective commit:** `bff6b5f` — accurate IDN characterization (no
  "confusable defence" claim; mixed-script *warning* + stricter validation +
  regression tests) and a **bounded, purpose-specific XML tokenizer** replacing
  regex-scraping (rejects DOCTYPE/`<!ENTITY>`/CDATA/PIs, limits, duplicate-attr,
  namespace-aware, unknown-entity fail-closed; malformed→`ambiguous_unknown`).
- **Stage 3a (crypto core):** `e2628fb` — keyring + AES-256-GCM envelope + AAD +
  blind index (18 tests).
- **Stage 3b (schema):** `67f9040` — 12 additive `domain_*` tables.
- **Stage 3c/3d (repos + report):** this commit — representative tenant-scoped
  encrypted repositories + tests + this report.

## Files / migration summary

Migration: appended to `src/persistence/PostgresDatabase.initialize()` (the
project's only mechanism — idempotent `CREATE TABLE/INDEX IF NOT EXISTS`), TEXT
ids/timestamps, additive only, **no existing table modified or dropped**.

New modules: `src/platform/domains/crypto/{Keyring,EnvelopeCipher,BlindIndex}.ts`
(+ `crypto.test.ts`), `DomainRegistrationRepository.ts`,
`DomainContactRepository.ts` (+ `domainRepositories.test.ts`).

## Table relationships (12 tables — reconciled from the suggested list)

```
organizations ──RESTRICT──┐  (external property: org can't be deleted while any exist)
  domain_orders (saga) ────┤   quote_id →SET NULL→ domain_quotes(CASCADE, disposable)
  domain_registrations ────┤   order_id →RESTRICT→ domain_orders
    ├─CASCADE→ domain_contacts (encrypted, versioned)
    ├─CASCADE→ domain_lifecycle_events (append-only)
    ├─CASCADE→ domain_notices (durable outbox, dedup per type)
    └─CASCADE→ domain_dns_state (→SET NULL→ hosting_accounts)
  domain_provider_attempts (append-only) ─RESTRICT→ orders/registrations
  domain_terms_acceptances (immutable) ───RESTRICT
  domain_transfer_requests ───────────────RESTRICT (no raw EPP)
  domain_support_actions (append-only) ────RESTRICT
domain_pricing_versions (global, immutable — referenced by quotes/orders/terms)
```

**Consolidation note:** the suggested `domain_renewal_settings` is consolidated —
current auto-renew state lives on `domain_registrations.autorenew_enabled`; the
auditable *choice* (actor/timestamp/terms/pricing version) is recorded as a
`domain_lifecycle_events` row. All other suggested concepts map 1:1.

## Field-classification matrix

| Field(s) | Classification | Where |
|---|---|---|
| `ascii_domain`, `unicode_domain`, `tld` | Plain operational (must be managed/resolved) | quotes/orders/registrations |
| `provider`, `provider_domain_id`, `order_id`, `provider_correlation_id` | Plain **sanitized** correlation | multiple |
| `provider_cost_minor`, `markup_minor`, `customer_price_minor`, `charged_minor`, `refunded_minor`, `currency`, `pricing_version` | Immutable financial/legal evidence (integer minor units) | quotes/orders |
| Registrant/admin/tech/billing **name, org, address, phone, email** | **Encrypted PII** (AES-256-GCM envelope) | `domain_contacts.contact_ciphertext` |
| Registrant **email / phone** (equality/dedup) | One-way **keyed HMAC blind index** (no raw) | `domain_contacts.email_blind_index / phone_blind_index` |
| **EPP/auth code** | **Ephemeral** — never durably stored; short-lived capability workflow | only `epp_capability_id` reference in `domain_transfer_requests` |
| Stripe secrets, registrar credentials | Never in these tables | env only |
| Provider request/response bodies (with PII) | Not stored — only sanitized correlation ids + outcome enums | `domain_provider_attempts` |
| Terms acceptance (versions/refs/fingerprint/ts/ip) | Immutable legal evidence | `domain_terms_acceptances` |
| Audit/attempt/support rows | Compact ids + enums only | attempts/support |

## Deletion / disposition model

- **Disposable:** `domain_quotes` cascade with the org (unpaid advisory data).
- **External property (never cascade):** registrations, orders, contacts,
  provider attempts, terms acceptances, transfers, lifecycle, support → org FK is
  **`ON DELETE RESTRICT`**, so **organization deletion fails closed** while any
  exist. Children of a registration cascade from `domain_registrations` (so a
  properly-dispositioned registration takes its own contacts/DNS/notices with
  it) but are still blocked at the org level by the registration's RESTRICT.
- **Disposition states** (`domain_registrations.disposition`): `retained_active`,
  `transferred_out`, `transferred_account`, `expired_released`,
  `platform_custody`, `pending`. A future disposition workflow sets these before
  an org can be removed.
- **SaaS cancellation ≠ domain cancellation** — domain billing/renewal is a
  separate lifecycle (Stage 9); this schema keeps registration status wholly
  separate from subscription/hosting state.

## Encryption-envelope format & AAD

- **Envelope:** `v1:<keyVersion>:<nonceB64>:<tagB64>:<ciphertextB64>` —
  AES-256-GCM, fresh **random 96-bit nonce per operation** (never reused with a
  key), 128-bit auth tag, `v1` = format version. Stored with `enc_alg` +
  `key_version` columns.
- **AAD:** `"v1|<organizationId>|<recordId>|<fieldType>"` where
  `recordId = "<registrationId>:<role>"` and `fieldType = "registrant_contact"`.
  A ciphertext copied to another **tenant, record, or field** fails
  authentication → `DecryptAuthError` (fail closed, **no partial plaintext**).
  Tests prove cross-tenant/record/field rejection and tamper rejection.

## Keyring & rotation design

- Keys loaded **only** from protected env (`DOMAIN_CONTACT_ENC_KEY_V<n>` +
  `DOMAIN_CONTACT_ENC_ACTIVE_VERSION`); 32-byte enforced; never in DB/source/
  logs/tests/fixtures/backups/API. `fromEnv()` returns null (fail closed) when
  unconfigured.
- **Active write version + decrypt-only prior versions.** Unknown version →
  `UnknownKeyVersionError` (fail closed). New writes always use the active
  version; existing rows keep their `key_version`.
- **Rotation:** `reencryptToActive()` decrypts (authenticating the original) then
  re-encrypts under the active key with a **fresh nonce**; the caller must durably
  commit the new envelope before discarding the old. Dry-run inventory via
  `encVersions()`. Tested: old-key-decrypt + active-key-write, rotation produces a
  new nonce/version. **No real rotation and no production keys were introduced in
  this stage.**
- **Backup/restore:** keys live outside the database, so a DB backup never
  contains key material; restore requires the keyring to be present separately.

## Blind-index design

Keyed **HMAC-SHA256** with a key **separate** from the AES key
(`DOMAIN_BLIND_INDEX_KEY_V<n>`), value normalized (email lowercased/trimmed;
phone digits-only), **purpose-separated** (`domain-registration|<purpose>|`),
and **versioned** (`<keyVersion>:<hex>`). Equality-only, never exposed to
clients, never an unkeyed hash. Documented limitation: a deterministic index
leaks equality (frequency analysis by an attacker with DB access) but not the
plaintext without the key. Only email + phone are indexed (the only equality
lookups the flow needs).

## Terms-acceptance model (schema support only)

`domain_terms_acceptances` records immutable, exact-version evidence: user, org,
order, `aec_terms_version`, `registrar_agreement_ref` +
`registrar_agreement_fingerprint` (external registrar terms are **referenced and
fingerprinted**, not copied and passed off as immutable), `pricing_version`,
`quote_id`, `years`, `auto_renew_choice`, `accepted_at`, `source`, `ip`. **No
legal text is published and no acceptance is activated in this stage** — the
`LegalMarkerError` publish guard continues to block drafts; the actual
domain-registration terms document/kind + acceptance flow is Stage 5.

## Migration / idempotency + real-PostgreSQL validation results

Ran the exact built `initialize()` against a **disposable isolated schema** on
the production PG 13.23 server (search_path pinned; `public` never touched):

- **Fresh init:** 12 `domain_*` tables (86 total = existing 74 + 12).
- **Idempotent re-init:** unchanged (12).
- **RESTRICT (fail closed):** deleting an org that has a `domain_registrations`
  row → FK violation `domain_registrations_organization_id_fkey`; org preserved.
- **CASCADE (disposable):** deleting an org whose only domain row is a
  `domain_quotes` row → succeeds; the quote is cascade-removed.
- **Unique active purchase:** a second active `domain_orders` for the same
  (org, domain) → `domain_orders_active_uniq` violation.
- **One confirmed registration** per (provider, domain) →
  `domain_registrations_provider_domain_uniq` violation.
- **Cleanup:** disposable schema dropped; production `public` **UNCHANGED (74)**.

## Tests / typecheck / build

- **Deterministic tests:** 92 passed / 3 skipped across the domain suite —
  including crypto (round-trip, random-nonce uniqueness, AAD cross-tenant/record/
  field rejection, tamper + unknown-version fail-closed, old-key-decrypt +
  active-key-write, rotation new-nonce, blind-index purpose/version/separate-key)
  and repositories (fail-closed with no tenant, cross-tenant read/write denial,
  **stored column is ciphertext not plaintext**, decrypt round-trip, blind-index
  present with no raw value, immutable version history). The 3 skipped are the
  opt-in Namecheap sandbox contract cases (no creds).
- **Typecheck:** PASS. **Production build:** PASS.

## Confirmation

No production database/schema, environment, domain, DNS, payment, refund, email,
credential, or provider object was changed. The real-PG test used a disposable
schema and dropped it; production `public` is unchanged (74 tables). No
encryption keys were introduced or committed.

## Remaining risks / unresolved questions

- **Encryption keys** are not yet provisioned (env) and **no rotation job** is
  built — deferred deliberately (no production keys this stage). A future
  external KMS can replace the env keyring (the `docs/04_SECURITY.md` KMS
  decision remains open).
- **Currency/FX:** rows carry an explicit currency; a provider-currency ≠
  customer-currency case must **fail closed** until an owner-approved FX model
  exists — to be enforced in the Stage 4 quote flow.
- **Registrar-of-record entity + IANA ID** still to be read from the account/API
  before legal text publishes (Stage 5).
- **Domain-registration terms content + attorney/owner review** — Stage 5;
  remains unpublished until then.

## GO / NO-GO

- **Proceed to Stage 4 (search + quote flow, with the "greater of plan % or $
  minimum" markup + quote expiry + recheck-before-purchase): GO** on your
  approval. Still sandbox-only, live purchasing disabled, no deploy.
- **Live activation / real registration / deploy: NO-GO.**

**Stopping after this Stage 3 report for your review.**
