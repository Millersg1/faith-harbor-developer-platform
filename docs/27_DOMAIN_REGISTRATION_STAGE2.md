# Domain Registration — Stage 2 Report (provider interface + Namecheap sandbox adapter)

**No live object of any kind was created.** No domain registered, no production
Namecheap credentials used, no Stripe charge, no DNS change, no email, no
provider mutation. All work is offline modules on branch
`feature/domain-registration`, **not wired into the running app** (the deployed
binary's behavior is unchanged), and live purchasing remains disabled by design.

## Files changed (all new, additive; nothing else touched)

- `src/platform/domains/domainName.ts` — IDNA/Punycode normalization + strict
  validity checking + a mixed-script **warning** heuristic. (This is NOT full
  Unicode confusable/UTS #39 detection — see the "IDN security" note below.)
- `src/platform/domains/RegistrarContact.ts` — registrant/admin/tech/billing
  contact shape (PII).
- `src/platform/domains/RegistrarProvider.ts` — the provider-neutral interface,
  capability matrix types, money type, 5-way outcome classification, errors,
  mode enum + fail-closed parser.
- `src/platform/domains/namecheapXml.ts` — safe parsing, redaction, decimal→minor,
  transport-error classification.
- `src/platform/domains/NamecheapRegistrarProvider.ts` — the Namecheap adapter.
- `src/platform/domains/FakeRegistrarProvider.ts` — deterministic offline fake.
- `src/platform/domains/registrarFactory.ts` — fail-closed factory + disconnected
  default.
- Tests: `domainName.test.ts`, `namecheapXml.test.ts`,
  `NamecheapRegistrarProvider.test.ts`, `registrarFactory.test.ts`,
  `FakeRegistrarProvider.test.ts`, `namecheapContract.test.ts` (opt-in).
- `docs/27_DOMAIN_REGISTRATION_STAGE2.md` — this report.

## Provider interface (`DomainRegistrarProvider`)

Provider-neutral boundary; Namecheap is one adapter. Money is **always integer
minor units + currency** (no floating point). Read methods: `checkAvailability`,
`getRegisterPrice`/`getRenewPrice`/`getTransferPrice`, `getRegistrationStatus`,
`getExpiry`, `getContacts`, `getNameservers`, `getRegistrarLock`,
`getAccountBalance`, `getTransferStatus`. State-changing methods: `register`,
`renew`, `initiateInboundTransfer` — each returns a **`RegistrarOutcome`**.
`capabilities()` returns an explicit matrix; a provider/TLD that lacks a feature
reports `unsupported`/`limited`/`unknown` rather than throwing generic errors.

## Capability matrix (Namecheap, tied to official API commands; `evidence: "docs"`)

| Capability | Status | API command / note |
|---|---|---|
| availability | supported | `namecheap.domains.check` |
| pricing | supported | `namecheap.users.getPricing` (uses `YourPrice` = our cost) |
| premiumDetection | supported | `domains.check` `IsPremiumName` + `PremiumRegistrationPrice` |
| registration | supported | `namecheap.domains.create` |
| nonRealtimeRegistration | **limited** | `NonRealTimeDomain=true` → treated as **ambiguous** until reconciled |
| renewal | supported | `namecheap.domains.renew` |
| incomingTransfer | supported | `namecheap.domains.transfer.create` (behind its own flag) |
| transferStatus | supported | `namecheap.domains.transfer.getStatus` |
| contactManagement | supported | `namecheap.domains.setContacts` |
| registrantChange | **limited** | confirmation rules vary by TLD |
| nameservers | supported | `namecheap.domains.dns.setCustom` |
| dnsRecords | supported | `namecheap.domains.dns.setHosts` |
| lockUnlock | supported | `namecheap.domains.setRegistrarLock` |
| eppAuthCode | supported | via `domains.getInfo`; owner-only + reauth, never logged |
| privacy | supported | `namecheap.whoisguard.*` (free WhoisGuard where TLD allows) |
| dnssec | **unknown** | unverified; confirm in sandbox before enabling |
| accountBalance | supported | `namecheap.users.getBalances` |
| domainStatus | supported | `namecheap.domains.getInfo` |
| autoRenewControl | **limited** | no reliable tenant auto-renew toggle → renewal worker must call `domains.renew` explicitly |
| providerEvents | **unsupported** | Namecheap has no webhooks; status is poll-only |

These are anchored to documented API commands; **live sandbox verification is
pending credentials** (the opt-in contract test upgrades `evidence` to
`"sandbox"` once run).

## Fake-provider behavior

`FakeRegistrarProvider` is deterministic and scriptable: availability overrides,
per-TLD prices, and — crucially — **forced register outcomes** so later stages
can prove the saga against the dangerous cases (`ambiguous_unknown`,
`registered:false`, `provider_rejection`) without any network. Default register
succeeds and echoes sanitized correlation ids.

## Namecheap sandbox adapter summary

Server-side only, injectable `Fetcher` (tests inject canned XML; prod uses
`fetch`). Base URL selects sandbox (`api.sandbox.namecheap.com`) vs live. Reads
parse the documented result elements; writes are **mode- and flag-guarded**:

- `disabled` → every op refuses.
- `namecheap_sandbox` → ops allowed against the sandbox.
- `namecheap_live` → reads allowed; `register`/`renew`/transfer require
  `DOMAIN_PURCHASING_ENABLED=true`.
- **Premium purchase** requires a **separate** `DOMAIN_PREMIUM_PURCHASING_ENABLED`
  (default false) — fail-closed in *all* modes.
- **Incoming transfers** require a **separate** `DOMAIN_INCOMING_TRANSFERS_ENABLED`
  (default false).

## Authentication & redaction design

Credentials (`ApiUser`/`ApiKey`/`UserName`/`ClientIp`) live only in server-side
config and are placed only in the outbound query string. They are **never**
returned, thrown, or logged: `redactSecrets()` strips the entire Namecheap query
string and any `ApiKey=/ApiUser=/UserName=/ClientIp=/Password=/Token=` value from
any diagnostic string, and transport errors are re-thrown **without** the URL. A
test asserts the raw wire URL contains the key but the redactor removes it.

## XML parsing safety

Namecheap responses are parsed by a **rigorously bounded, purpose-specific
tokenizer** (`parseNamecheap` in `namecheapXml.ts`) — not a general XML parser
and not regex-scraping. Guarantees:

- **DOCTYPE, `<!ENTITY>`, any `<!` markup declaration, CDATA, and stray
  processing instructions are rejected before parsing** → no DTD, no entity
  declarations, no external-entity resolution. Only the five predefined XML
  entities + bounded numeric character references are decoded; **any other
  `&name;` is rejected** (fail closed), so XXE / entity-expansion ("billion
  laughs") is structurally impossible.
- **No network or filesystem access** — the tokenizer only reads the in-memory
  string.
- **Hard limits:** max bytes (1 MB), element count (5 000), attributes/element
  (64), attribute length (8 KB), text length (16 KB), nesting depth (32).
- **Duplicate attribute names are rejected** (defends against security-sensitive
  attribute smuggling).
- **XML namespaces handled** — a leading `xmlns`/prefix is tolerated and callers
  match on the local element name.
- **Escaped text/attribute values are decoded** correctly.
- **Malformed / truncated / oversized / unexpected input throws
  `NamecheapParseError`**, which the adapter turns into `ambiguous_unknown` for a
  mutating request — never a "definitive failure".
- Raw response bodies are never logged/audited; only bounded, sanitized fields
  are surfaced. Money is parsed from decimal strings **without floating point**
  (`decimalToMinor`).

Authentic-fixture tests cover: success + namespaces, provider errors (single +
multiple), premium results, non-real-time create, escaped characters, unknown
response elements, and the hostile set (DOCTYPE, `<!ENTITY>`/XXE, unknown
entity, duplicate attributes, deep nesting, oversized, truncated, unclosed,
stray PI).

## IDN security (honest characterization)

`domainToASCII()` provides IDNA/ASCII conversion and invalid-domain rejection —
**it is not, by itself, Unicode confusable/homoglyph detection.** This build
therefore does **not** claim "confusable defence." It provides: canonical ASCII
(Punycode) + a separate normalized Unicode display form; rejection of invalid
conversion, disallowed control/format/invisible code points, bad hyphen
placement, over-length, and inconsistent round-trip; and a **mixed-script
warning heuristic** (Latin mixed with Cyrillic/Greek) that is explicitly a
warning, not full detection. A **single-script homograph** (e.g. an all-Cyrillic
lookalike) converts and validates cleanly and is **not** flagged — a regression
test asserts this and documents the limitation. Callers MUST show BOTH the
Unicode and ASCII forms of a non-ASCII domain on the final review screen and
require explicit confirmation before purchase. Full confusable detection, if
added later, will be based on a **pinned Unicode UTS #39 data version**.

## Error / outcome classification

Every write maps to exactly one honest outcome:

- `definitive_success` — `Registered=true` (real-time).
- `definitive_failure` — `Registered=false` (real-time) / `Renew=false`.
- `provider_rejection` — API `Status="ERROR"` (business rule / duplicate).
- `transport_failure_pre_acceptance` — DNS/refused/TLS before the request landed.
- `ambiguous_unknown` — connection reset/timeout mid-flight, `NonRealTimeDomain=true`,
  or an unparsable 200. **Never auto-retried by this layer.**

Sanitized correlation values captured: charged amount (minor), currency, domain
id, order id, transaction id — safe for storage/admin display.

## Verification results

- **Typecheck:** PASS (`tsc -p tsconfig.json --noEmit`).
- **Focused offline tests (after Stage 2 corrections):** **68 passed / 3 skipped** across 5 files
  (`vitest run src/platform/domains/`). The 3 skipped are the opt-in sandbox
  contract cases.
- **Production build:** PASS (`npm run build`); modules compiled to
  `dist/platform/domains/`.
- **Sandbox contract tests:** **SKIPPED** — no credentials present (they run only
  when `RUN_NAMECHEAP_SANDBOX_CONTRACT=1` **and** all `NAMECHEAP_SANDBOX_*` vars
  are set; read-only availability + pricing only).

## Missing credentials needed to run the sandbox contract test (names only)

- `RUN_NAMECHEAP_SANDBOX_CONTRACT=1`
- `NAMECHEAP_SANDBOX_API_USER`
- `NAMECHEAP_SANDBOX_USERNAME`
- `NAMECHEAP_SANDBOX_API_KEY`
- `NAMECHEAP_SANDBOX_CLIENT_IP`

Plus the mode/flags: `DOMAIN_REGISTRAR_MODE=namecheap_sandbox`,
`DOMAIN_PURCHASING_ENABLED=false`, `DOMAIN_PREMIUM_PURCHASING_ENABLED=false`,
`DOMAIN_INCOMING_TRANSFERS_ENABLED=false`. Place values in your protected env
location; do not paste them here.

## Read-only outbound-IP finding (for Namecheap whitelisting)

Determined read-only from the `~/aecloud` runtime (user `faithhosting`, cwd
`/home/faithhosting/aecloud`). Four independent HTTPS echo services **all**
returned the same address, corroborated by the cPanel main IP:

- api.ipify.org → **192.227.127.13**
- ifconfig.me → **192.227.127.13**
- ipinfo.io → **192.227.127.13**
- checkip.amazonaws.com → **192.227.127.13**
- `/var/cpanel/mainip` → **192.227.127.13**

**Whitelist `192.227.127.13` in the Namecheap API settings.** (The box also holds
.14–.17 and .66–.70 incl. .69, but the account's outbound egress is the main IP
.13.) No firewall/DNS/Apache/Namecheap/production change was made — evidence only.

## Stage 1 assumptions vs actual Namecheap API — deltas

- **Non-real-time registrations** are a real Namecheap possibility
  (`NonRealTimeDomain=true`); Stage 2 models this explicitly as
  `ambiguous_unknown` (reconcile, never assume). (Refinement, not a contradiction.)
- **Auto-renew** confirmed as a provider **limitation** — no reliable tenant
  toggle via the domain API; the renewal worker (Stage 9) will call
  `domains.renew` explicitly. (Matches the Stage 1 flag.)
- **No provider webhooks** — `providerEvents: unsupported`; status is poll-only
  (Stage 1 said "where available" — confirmed none).
- **Registrar-of-record entity + IANA ID** still to be read from the account/API
  before legal text publishes (unchanged from Stage 1; not invented).
- Custody note (documented): API-registered domains reside operationally within
  the All Elite Cloud Namecheap account while the customer remains the legal
  registrant; transfer-away must remain available. This is carried into the
  Stage 5 legal terms and Stage 10 transfer flow.

## Confirmation

No live domain, DNS record, email, payment, refund, or external provider object
was created. No production credentials were used. Nothing was deployed or enabled.

## GO / NO-GO

- **Proceed to Stage 3 (additive schema + versioned encryption model): GO** when
  you approve. Still sandbox-only, live purchasing disabled, no deploy.
- **Live activation / real registration / deploy: NO-GO.**

**Stopping after this Stage 2 report for your review.**
