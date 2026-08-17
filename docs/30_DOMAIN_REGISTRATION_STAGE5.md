# Domain Registration — Stage 5 Report (terms drafts + registrant-contact workflow)

**Nothing deployed, enabled, purchased, transferred, renewed, restored,
refunded, emailed, or changed in any registrar account.** Terms remain
UNPUBLISHED. No production encryption keys were set. The only production action
was a **strictly read-only** NameSilo `getPrices` call (no mutation), which never
printed the API key or the request URL.

## Commits
- **Legal drafts (separate):** the `domain-registration` legal kind + the DRAFT,
  versioned terms (kept unpublishable by embedded `LEGAL REVIEW REQUIRED`
  markers).
- **Registrant-contact implementation (separate):** validation/normalization,
  owner-only + reauth policy, encrypted contact service, terms-acceptance
  evidence service, hardened GET-query transport, notice designs, tests, this
  report.

## 1. Pricing evidence (UPDATED — authoritative read-only API + public-page)

### Authoritative: NameSilo `getPrices` for the production account (read-only)
Checked **2026-08-17T15:46:44Z**, currency **USD**, reply code 300. The key and
URL were never printed/logged; no provider object was created or modified.

| TLD | Registration | Renewal | Transfer | Restore |
|---|---|---|---|---|
| .com | $17.29 | $17.29 | $10.80 | not returned |
| .net | $15.95 | $15.95 | $11.35 | not returned |
| .org | $14.99 | $14.99 | $11.99 | not returned |
| .info | **$5.25 (promo)** | **$29.49** | $22.49 | not returned |
| .biz | **$7.99 (promo)** | **$23.49** | $19.95 | not returned |
| .co | **$3.99 (promo)** | **$38.99** | $32.99 | not returned |
| .io | $33.99 | $69.99 | $53.49 | not returned |
| .us | $5.49 | $7.99 | $7.49 | not returned |

**Material findings:**
1. **The account is NOT on Discount Program "0+" pricing.** The public page shows
   .com at **$11.05** (Discount Program), but the account's live API price is
   **$17.29 (retail)**. Our true wholesale cost is the retail figure unless the
   owner enrolls in NameSilo's Discount Program / confirms reseller wholesale
   pricing. **Flagged for owner decision — not assumed.**
2. **Promo-registration vs. renewal gaps** on several TLDs (.info, .biz, .co).
   Markup + customer disclosure must key off the **renewal** price, never the
   promo first-year (Stage 4 already shows them separately).
3. **Restoration/redemption price is not returned by `getPrices`** → remains
   **BLOCKED** until a separate authoritative source is verified.
4. **Namecheap comparison remains BLOCKED** (no Namecheap credentials available).

### Public-page evidence (owner-supplied, dated, NON-authoritative)
Recorded for reference only — **not** a checkout price. Discount Program "0+":
.com 11.05 / .net 11.85 / .org 13.49 / .info 29.39 / .biz 23.39 / .co 38.89 /
.io 69.89 / .us 7.89 (registration = renewal). Transfer sale prices are
temporary and are NOT stored as permanent regular pricing. Retail .com shown:
$17.29 (matches the authoritative API — i.e. this account gets retail, not the
Discount Program rate).

**Conclusion:** the authoritative price is always re-checked immediately before
checkout (Stage 4). **Final customer markup is NOT finalized** from these pages,
and terms are NOT published from them.

## 2. Terms (DRAFT, unpublished)
Added legal kind `domain-registration` + a versioned DRAFT
(`domainRegistrationTerms.ts`). It is **not attorney-approved** and cannot be
published: the body carries `LEGAL REVIEW REQUIRED` markers that the server-side
`LegalMarkerError` guard refuses to publish. The draft accurately covers every
required point: NameSilo is the registrar of record and All Elite Cloud/Faith
Harbor LLC is the reseller (AEC is NOT ICANN-accredited); the customer is the
legal registrant; accurate-data + verification duties; contact data flows to
registrar/registry; privacy where supported (not promised for all TLDs);
availability/pricing not guaranteed until success; premium requires explicit
confirmation; registration/renewal/transfer/restoration/registry/tax shown
separately; payment ≠ guaranteed registration; documented refund on definitive
failure; ambiguous outcomes investigated first; ICANN/registry restrictions +
waiting periods; EPP codes via the registrar's process, never exposed to
unauthorized members; auto-renew/expiration/grace/redemption/loss without invented
universal deadlines; cancellation/tenant-deletion never surrenders a domain;
transfer-away rights; abuse/court/registry/ICANN restrictions; unsupported TLD
features fail closed; and **no claim** that Domain Defender prevents all
unauthorized changes. Attorney-review items flagged in
`DOMAIN_TERMS_ATTORNEY_REVIEW_ITEMS`: refunds, renewal/expiration, liability,
disputes, registrant-data processing, transfer rights, NameSilo/ICANN
incorporation.

## 3. Registrant-contact workflow (encrypted, tenant-scoped, versioned)
- **Authorization** (`contactAuthPolicy.ts`): ownership/registrant/contact changes
  are OWNER-ONLY; an admin may act only if the owner explicitly granted domain
  admin authority; **members can never** purchase/transfer/unlock/registrant-change;
  registration/transfer/unlock/registrant-change/EPP/auto-renew require **recent
  reauthentication**.
- **Validation/normalization** (`contactValidation.ts`): names, email, phone,
  ISO-2 country, postal — errors name **only the field**, never the value.
  **Unsupported-TLD requirements FAIL CLOSED** (only standard gTLDs supported;
  .us/.ca/etc. rejected until their extra requirements are built).
- **Service** (`DomainContactService.ts`): validate → TLD check → require the
  customer's **accuracy + authorization confirmation** → encrypt via the Stage-3
  keyring with **AAD(org|registration:role|field)**; **ciphertext-only** storage;
  **immutable version history**; the org comes from tenant context (never the
  caller); client-supplied tenant/provider/price/currency/premium/record ids are
  not accepted; the registrant is always the customer (AEC/Faith Harbor never
  substituted).

## 4. Provider secrets & GET-query protection
A **hardened fetcher** (`transport/hardenedFetch.ts`) is now the default transport
for both adapters: **HTTPS-only + host allowlist** (only the approved provider
API hostname), **redirects REFUSED** (`redirect:"error"` — secrets never follow a
redirect to another host), **time + size bounded**, and **errors that never
contain the URL or key** (the underlying fetch error — which can embed the full
URL — is replaced with a URL-free code; DNS/TLS failures fail closed). No provider
call is made from the browser. Domain Defender's security answer is never
requested/stored/transmitted/logged/automated (asserted by test). Tests cover
host refusal, insecure-scheme refusal, redirect-refusal, and the hostile
"error-contains-full-URL" leak case.

## 5. Terms-acceptance evidence
`DomainTermsService` records immutable evidence with **only** the allowed fields
(user id, org id, exact terms version, quote id, normalized domain, operation +
term, final price + currency, premium acknowledgement, timestamp, source, IP) —
**no raw payment data, API keys, or unnecessary contact PII**. It **fails closed**
when no terms version is published (so nothing can be accepted against a draft),
and a **materially newer published version requires re-consent** for future
purchases without altering completed registrations.

## 6. Notices (design only — nothing sent)
`notices/domainNotices.ts` catalogs all 13 required customer notices as
**transactional** (no marketing enrollment / consent inference). Not wired to
send in this stage.

## 7. Tests / typecheck / build
Domain suite: **141 passed / 3 skipped** (3 = opt-in Namecheap sandbox contract).
Coverage of the required matrix: owner/admin/member permissions + reauth;
tenant + cross-tenant isolation; encrypted contact history; invalid/incomplete
contacts; unsupported-TLD fail-closed; stale-terms + stale-quote rejection (Stage
4 + Stage 5); premium acknowledgement; **provider redirect + URL-secret leakage**;
ambiguous provider outcomes (adapter layer); no PII/secrets in errors; NameSilo vs
Namecheap provider separation. Tenant-deletion-blocked-while-domains-remain was
proven against real PostgreSQL in Stage 3 (RESTRICT). **Typecheck + build PASS.**

## Schema deltas (additive, idempotent)
`domain_contacts`: `accuracy_confirmed`, `authorized_confirmed`.
`domain_terms_acceptances`: `ascii_domain`, `operation`, `final_price_minor`,
`currency`, `premium_acknowledged` (+ a user index). All are
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` on existing domain tables — the same
idempotent pattern validated against real PostgreSQL in Stage 3. A fresh
disposable-schema re-validation can be run on request.

## Remaining risks / BLOCKED
- **Discount Program vs. retail** — owner decision needed (materially affects
  margin); the account currently gets retail pricing.
- **Restoration/redemption price** — BLOCKED (not in `getPrices`).
- **Namecheap price comparison** — BLOCKED (no credentials).
- **Attorney review** of the draft terms — required before publish.
- **Encryption keys** not yet provisioned; **OTE sandbox** contract test pending
  NameSilo sandbox credentials.

## Confirmation
No production database/env change beyond a read-only pricing call; no domain,
DNS, payment, refund, email, credential store, or provider mutation; terms
unpublished; nothing deployed or enabled.

## GO / NO-GO
- **Stage 6 (Stripe-bound purchase saga): GO** on your approval — sandbox-only,
  purchasing disabled.
- **Live activation / real registration / deploy / publish terms: NO-GO.**

**Stopping after this Stage 5 report for your review.**
