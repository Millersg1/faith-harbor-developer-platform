# Domain Registration — Stage 4 Report (NameSilo adapter + search & quotation)

**No production/live change; sandbox-only design; nothing deployed or enabled.**
No real domain, DNS record, email, payment, refund, credential, or provider
object was created. Live purchasing stays disabled. NameSilo production keys are
NOT in source control; all work used fake/sandbox-shaped inputs.

## Commits

- **NameSilo adapter (provider correction):** `dca90b1` — NameSilo is the intended
  launch registrar; Namecheap remains an intact secondary adapter and Stage 4
  does not depend on it.
- **Stage 4 (this commit):** provider-neutral search + quotation service +
  pricing policy + tenant-scoped quote repository + tests + this report.

## Files

- `NameSiloRegistrarProvider.ts` (+ test) — the launch adapter.
- `pricing/PricingPolicy.ts` — configurable "greater of % or fixed-min" markup.
- `DomainQuoteService.ts` — provider-neutral search + immutable/expiring quotes +
  recheck-before-purchase.
- `DomainQuoteRepository.ts` — tenant-scoped, fail-closed.
- `domainQuote.test.ts` — the Stage 4 deterministic matrix.
- Additive schema: `domain_quotes.operation` column (`ALTER … ADD COLUMN IF NOT
  EXISTS`, default `register`).

## NameSilo adapter (launch provider)

Implements the existing `DomainRegistrarProvider` interface. Transport:
`{base}/{operation}?version=1&type=xml&key=…` (GET); reply **code 300 = success**.
It reuses the Stage-2 bounded, safe XML tokenizer (provider-neutral), so all
parsing-safety properties (no DTD/entity/network, bounded, duplicate-attr
rejection, malformed→ambiguous) carry over. Server-side only; the API key is
never returned/thrown/logged (`redactSecrets` extended to strip NameSilo's
`/api` query + `key=`/`auth=`). Mode + fail-closed flags gate every mutation; the
five-way outcome classification is preserved and an ambiguous mutation is never
auto-retried; money is integer minor units.

### Domain Defender
Your account has Domain Defender enabled with all email notifications. This
adapter **never requests, stores, transmits, logs, or automates the Domain
Defender security answer** — it is not an API parameter here, and a test asserts
no `security/answer/defender/question` param ever appears in a generated URL.
Domain Defender's security question/answer protects **interactive/web** sensitive
changes; API calls authenticate via the API key (plus any optional account IP
allowlist). **Whether Domain Defender additionally gates specific API mutations
(e.g. transfer-out, unlock, nameserver change) cannot be confirmed without OTE
credentials and is flagged for sandbox verification — it is not assumed away.**

## Capability comparison — NameSilo vs Namecheap (from documented API operations)

Evidence is **docs-level**; items needing the OTE sandbox are flagged. We do not
assume parity.

| Capability | NameSilo | Namecheap | Notes |
|---|---|---|---|
| availability | supported | supported | |
| pricing | supported | supported | |
| premium detection + price | supported | supported | |
| registration | supported (real-time) | supported (may be non-real-time → ambiguous) | NameSilo simpler |
| renewal | supported | supported | |
| **auto-renew control (API)** | **supported** (`addAutoRenewal`/`removeAutoRenewal`) | **limited** (no reliable API toggle) | **NameSilo advantage** — needed for customer auto-renew choice + our renewal worker |
| **DNSSEC (API)** | **supported** (`dnsSec*`) | **unknown** | NameSilo advantage |
| restoration / redemption | limited (`restoreDomain`; price source to verify) | unknown (not in basic API) | NameSilo advantage |
| incoming transfer + status | supported | supported | |
| contact management | supported | supported | |
| nameservers | supported | supported | |
| DNS records | supported | supported | |
| lock / unlock | supported | supported | |
| **EPP/auth code** | supported, **emailed to registrant** (never in API body) | supported (via `getInfo`) | NameSilo is more secure by default — aligns with our "never log EPP" rule |
| WHOIS privacy | supported (free) | supported (free) | |
| account balance | supported | supported | |
| domain status | supported | supported | |
| provider events / webhooks | unsupported (poll-only) | unsupported (poll-only) | both poll-only |
| auth model | single API key (+ optional account IP allowlist) | API key **+ mandatory IP whitelisting** (.13) | NameSilo simpler to operate |

## Primary-provider recommendation

**Recommend NameSilo as the PRIMARY launch provider**, Namecheap as secondary,
based on **verified functional advantages** (not promotional pricing):

1. **True API auto-renew control** — Namecheap lacks a reliable API toggle; we
   need this for the customer's explicit auto-renew choice and the Stage 9
   renewal worker.
2. **DNSSEC via API** and a **restore/redemption** operation.
3. **EPP codes delivered to the registrant by email** (never in the API body) —
   structurally safer and consistent with our secrets policy.
4. **Simpler, transparent operation** — single API key, free WHOIS privacy, and
   NameSilo's flat/no-first-year-gimmick pricing model.

**Pricing caveat (must verify before final commercial lock):** a true *total*
cost comparison — registration **and renewal and transfer and restoration**, not
promotional first-year registration — requires pulling both providers'
`getPrices` in their sandboxes with credentials. Promotional registration pricing
alone must not drive the decision. Final commercial markup percentages remain
**provisional pending your explicit approval** (see below).

## Stage 4 search & quotation service (provider-neutral)

- **Search** (advisory) returns availability + **registration, renewal, transfer
  and restoration prices separately** (no first-year-only presentation hiding
  renewal), plus the IDNA `mixedScriptWarning`. Nothing is persisted.
- **Quote** is an **immutable, expiring** record bound to **tenant + normalized
  ASCII domain + TLD + operation + term + currency + provider + pricing
  version**, with a 15-minute TTL. Customer prices only; wholesale cost/markup
  are never in the customer view.
- **Recheck-before-purchase** re-fetches the live provider price and **fails
  closed** if the quote is not active, is expired (→ marked expired, requires
  reconfirmation), the price changed (`QuoteChangedError`), the currency
  mismatches, or a premium confirmation is missing. No checkout from a stale
  quote.
- **Currency:** a provider/customer currency mismatch **fails closed** — no FX
  conversion (both current adapters return USD).
- **No client-supplied** provider cost, markup, currency, or premium status is
  accepted — every figure is computed server-side from the provider + policy.

## Pricing policy

Configurable **"greater of plan-tiered percentage markup OR plan-tiered fixed
minimum markup"**, integer minor units, single rounding on the percentage, no
floating-point money. The numbers are in ONE place (`PricingPolicy.ts`) and
carry `provisional: true` — **the previously-discussed figures are provisional
defaults and are NOT final commercial pricing until you approve them.** Provider
cost + our markup appear only in **owner/platform-admin diagnostics**; customers
see the **final price and the renewal price**. Taxes and Stripe fees are neither
invented nor silently absorbed — they are out of scope here and will be handled
explicitly at checkout (Stage 6) based on what actually applies.

## Preserved Stage 2/3 safety properties

Provider-independent interface ✓; five-way outcome classification ✓; ambiguous
mutations never blindly retried ✓; IDNA normalization + honest mixed-script
warning ✓; bounded safe response parsing ✓; encrypted contacts with
tenant/record/field AAD + HMAC blind indexes (Stage 3) ✓; tenant isolation (quote
repo fail-closed) ✓; customer remains the legal registrant ✓; ownership records
survive tenant deletion (Stage 3 RESTRICT) ✓; money in integer minor units ✓; no
secrets/PII in logs or audit ✓.

## Tests / typecheck / build

- **Deterministic tests (Stage 4 matrix):** normal + premium domains; unavailable
  domain; malformed/IDN/mixed-script; quote expiration (marks expired); provider
  price change (`QuoteChangedError`); concurrent quotes (distinct ids); tenant
  isolation + cross-tenant quote use (`QuoteStaleError`); currency mismatch
  (`CurrencyMismatchError`); provider timeout before acceptance (no quote
  persisted); customer view hides cost/markup (no PII/secret leakage);
  greater-of-%-or-min pricing math. Provider-timeout/ambiguous *registration*
  outcomes are covered at the adapter layer (NameSilo + Namecheap tests).
- Full domain suite: **121 passed / 3 skipped** (the 3 skipped are the opt-in
  Namecheap sandbox contract cases). **Typecheck + production build PASS.**

## Secrets

NameSilo production settings and API keys are treated as secrets and are NOT in
source control. Env var names (values placed only in a protected env location):
`DOMAIN_REGISTRAR_MODE=namesilo_sandbox`, `NAMESILO_SANDBOX_API_KEY`,
`DOMAIN_PURCHASING_ENABLED=false`, `DOMAIN_PREMIUM_PURCHASING_ENABLED=false`,
`DOMAIN_INCOMING_TRANSFERS_ENABLED=false`. A read-only OTE contract test can be
added (mirroring the Namecheap one) once you provide sandbox credentials.

## Remaining risks / unresolved questions

- **NameSilo capabilities are docs-level** — the OTE sandbox (credentials
  required) must confirm exact reply codes, the restore-price source, premium
  register params, and whether Domain Defender gates any specific API mutation.
- **Final commercial markup percentages** await your explicit approval
  (provisional now).
- **Total-cost pricing comparison** (renewal/transfer/restoration, not promo)
  needs both sandboxes to lock the primary-provider decision commercially.
- Taxes/fees handling is deferred to checkout (Stage 6).

## Confirmation

No production database/env/domain/DNS/payment/refund/email/credential/provider
object was changed. Nothing was deployed or enabled.

## GO / NO-GO

- **Proceed to Stage 5 (terms + registrant-contact flow — unpublished terms,
  encrypted contacts): GO** on your approval. Sandbox-only, purchasing disabled.
- **Live activation / real registration / deploy: NO-GO.**

**Stopping after this Stage 4 report for your review.**
