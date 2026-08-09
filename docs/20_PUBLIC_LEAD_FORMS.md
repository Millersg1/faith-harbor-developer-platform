# Public Lead Forms — external embedding, consent, and delivery

Status: **in progress on `feature/public-lead-forms` (not deployed, no PR).**
This document is the source of truth for how a tenant's clients capture leads
from their OWN external websites, and the security/consent model around it.

## Three separate outcomes (never conflated)

A public form submission produces up to **three independent** outcomes, each
with its own trigger and its own rules:

1. **CRM lead** — create or safely merge the lead (`lead_created`). Always safe.
2. **Lead-magnet delivery** — deliver the specifically requested item as
   **transactional** fulfillment (`lead_magnet_requested`). You get what you
   asked for even if you never opt into marketing.
3. **Marketing automation** — start ongoing sequences **only** on explicit
   affirmative consent (`marketing_opted_in`), and only when the platform's
   consent/unsubscribe/suppression core is in place. Fail-closed otherwise.

A lead being created NEVER, by itself, starts marketing.

## The form slug is PUBLIC — not a secret, not authorization

The share slug appears in the embedding page's HTML source. Treat it as
discoverable. It is not a capability, not an auth token, and not spam
protection. Security comes from: fail-closed tenant scoping, per-form
allowed-origins, abuse controls (rate limit / honeypot / timing / size /
idempotency), consent gating, and suppression — never from the slug being
"hard to guess."

## Origin policy — the decision (accurate description)

- **GET config:** returning `200` **without** `Access-Control-Allow-Origin` for a
  disallowed Origin is CORS *response* policy, not server authorization. The
  config is public + non-sensitive, so it is served either way; the browser
  simply can't read it cross-origin unless the Origin is allowed.
- **POST submit:** the per-form allowed-origins list, **when configured**, is
  ALSO enforced as a submission restriction for **browser** requests — a request
  carrying an Origin that is neither same-host nor in the allowlist (and not
  `allowAnyOrigin`) is refused with `403` **before any** lead / consent /
  attribution / activation / magnet / enrollment / outbox mutation.
- **Missing Origin (server-to-server):** allowed — Origin is forgeable/omittable,
  so it is never authentication; these requests are governed by the abuse
  controls (rate limit, honeypot, timing, size, idempotency) + host-binding +
  suppression. (A future hash-only scoped form-submission key could add a hard
  server-side origin restriction; none is required today.)
- **Default (no allowlist) / `allowAnyOrigin`:** open. Same-origin tenant form
  submissions always work.
- The unguessable slug and the CORS allowlist are **never** described as
  authentication against automated abuse; the abuse controls above are.

## CORS is a browser policy — not auth, not anti-bot

CORS only decides which browser origins may read a cross-origin response. It is
**not** authentication and **not** spam/abuse protection, and it does nothing
for non-browser clients. Abuse protection is enforced server-side, independent
of CORS. (Detailed per-form allowed-origins model documented as it lands.)

## Safe external embedding

Render every remotely-supplied string as **text**, never as HTML. Confirmation
copy, field labels, validation and error messages, form names, and lead-magnet
titles are all data — never insert them with `innerHTML` / `outerHTML` /
`insertAdjacentHTML`.

```html
<form id="lead">
  <input name="name" autocomplete="name">
  <input name="email" type="email" autocomplete="email">
  <!-- honeypot: real users never fill this; keep it visually hidden -->
  <input name="website" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true">
  <button>Request the guide</button>
</form>
<script>
  const BASE = 'https://<tenant-domain>';        // the tenant that owns the form
  const form = document.getElementById('lead');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const res = await fetch(`${BASE}/api/public/forms/<slug>/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const out = await res.json().catch(() => ({}));
    // TEXT rendering only — a malicious confirmation message stays inert.
    const p = document.createElement('p');
    p.textContent = out.confirmationMessage || 'Thanks — check your email.';
    form.replaceWith(p);
    // A lead-magnet redirect, if any, is a server-validated absolute URL.
    if (typeof out.redirectUrl === 'string' && /^https?:\/\//i.test(out.redirectUrl)) {
      const a = document.createElement('a');
      a.href = out.redirectUrl; a.rel = 'noopener noreferrer'; a.textContent = 'Continue';
      p.after(a);
    }
  });
</script>
```

Never do `element.innerHTML = out.confirmationMessage` (or `outerHTML`,
`insertAdjacentHTML`). It would execute `"<img src=x onerror=...>"`.

## Attribution & data minimization

Every public submission records attribution, minimized to what's justified and
disclosed:

- **No user-agent.** The V1 Privacy Policy's data inventory discloses IP address
  ("Authentication and security data … IP address … to rate-limit abuse") but
  does **not** list user-agent/device data. So user-agent is **not collected**,
  and no visitor fingerprinting is performed. *(Factual note: an earlier build on
  this branch collected user-agent; that was inconsistent with the disclosed
  inventory and has been removed. The immutable V1 document is unchanged.)*
- **IP is stored only as a short keyed hash** (`ipHash`, HMAC-truncated), never
  the raw address. The raw IP is used **transiently** for rate limiting and is
  never persisted. IP is derived via the app's trusted-proxy config
  (`trust proxy = 1` → `req.ip`), never from arbitrary `X-Forwarded-For`.
- **Landing URL & referrer are reduced to origin + path** — the query string,
  fragment, and any URL credentials are dropped — so we never persist URL
  tokens, consent/email tokens, or sensitive query parameters. UTM values are
  separate short labels (control-stripped, length-limited).
- Attribution is tenant-scoped (on the tenant's `form_submissions`) and never
  exposed publicly or across tenants.

## Suppression, unsubscribe & consent confirmation (S6)

**Tenant unsubscribe vs global technical suppression are separate.** A recipient
unsubscribe is *tenant-scoped* (`email_suppressions` row with an
`organization_id`) — unsubscribing from Tenant A never affects Tenant B, and B
can't infer A's status. *Global* technical suppression (`organization_id` NULL —
hard bounce, complaint, abuse, invalid recipient, legal/safety) applies across
tenants but is **never attributed to a tenant**: a tenant's eligibility check
returns only the neutral `{eligible:false, reason:"suppressed"}` — no reason
detail, timestamp, or other tenant's relationship. A tenant's own unsubscribe
surfaces as `reason:"unsubscribed"`. Soft bounces are **not** routed to global
suppression. Global suppression is **not** a shared marketing unsubscribe list.

**No-login unsubscribe.** The visible unsubscribe link uses the hardened
fragment→POST exchange (`/unsubscribe#u=<token>`): a neutral page reads the
fragment, strips it via `history.replaceState`, and POSTs it — so the token
never reaches an access log, browser history, `Referer`, analytics, or cache.
`GET /unsubscribe` has **no side effect** (safe for email/security scanners);
the POST performs the (idempotent) suppression. Token pages send
`Referrer-Policy: no-referrer`, `Cache-Control: no-store, private`,
`X-Robots-Tag: noindex`, load no third-party assets, and expose no
lead/tenant/campaign/CRM data.

**RFC 8058 one-click token reality (documented honestly).** The
`List-Unsubscribe` header carries an https URL the mail client/provider submits
**server-to-server** via `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
(POST). Because that is the provider's request, the one-click token
**necessarily appears in the request path** the provider sends and thus in the
server access log — this is inherent to RFC 8058 and is not hidden. It is made
safe by construction: the token is random high-entropy, single-purpose
(unsubscribe only — it can never resubscribe or read data), tenant+recipient
scoped, **hash-only** at rest, revocable via suppression state, idempotent, and
contains **no email address, organization id, lead id, or reversible personal
data**. A `GET` on the one-click URL never unsubscribes.

**Double opt-in.** Default ON for public forms. The confirmation token is
random, single-use, time-limited (72 h), hash-only at rest, and scoped to
(tenant, email, consent version). It travels via the same fragment→POST exchange
(`/marketing/confirm#c=<token>`). Confirming records immutable consent evidence;
expired/replayed/forged/cross-tenant/already-used tokens fail safely. Email
confirmation proves control of the address — **not** full identity. No marketing
enrollment happens before confirmation when double opt-in is on. If an
owner/admin deliberately disables double opt-in, explicit affirmative consent is
still required.

**Enrollment uniqueness — selected behavior: "once active at a time."** A
partial unique index (`drip_enrollments_active_uniq` on
`(organization_id, sequence_id, LOWER(email)) WHERE status='active'`) plus the
service-level active-enrollment dedup guarantee **at most one active enrollment**
per (tenant, sequence, email). A duplicate submission or delayed retry cannot
create a second simultaneous active enrollment. Legitimate **re-enrollment is
still allowed after a completed/canceled run** (the constraint applies only to
active rows), so future re-engagement is not permanently blocked.

**Pre-send eligibility (S6 hook).** The drip worker rechecks suppression
immediately before each send: a suppression recorded *after* enrollment — even
for a long-queued message — cancels the send. Skipped sends record a compact
non-PII `last_event` (e.g. `skipped:unsubscribed`) and are **not metered**. The
fuller atomic eligibility set (consent valid, double-opt-in confirmed, lead
active, step-not-already-sent, sender valid) and per-message send/skip/fail
logging land with S7.

**Durable audit.** The durable evidence is the DB itself — `email_suppressions`,
`marketing_consents` (with exact wording/version), consumed double-opt-in
tokens, and enrollment `last_event`. No raw tokens are stored (hash-only), and
tenant-facing eligibility never discloses cross-tenant suppression history. The
compact queryable marketing audit spine (action + enum + opaque ids only — never
email, name, token, wording, body, unsubscribe URL, provider response, or IP)
is added with the S7 send spine.

## Marketing send outbox — precise delivery guarantees (S7a)

Claims stated exactly (no over-promising):

- **Idempotent, exactly-once *enqueueing*** per enrollment step (`UNIQUE
  (enrollment_id, step_index)`).
- **Exactly-once *metering*** — a message is metered iff/when it reaches `sent`,
  once.
- **No automatic blind resend after an ambiguous SMTP attempt.**
- **External email delivery is NOT guaranteed exactly once.** SMTP has an
  unavoidable ambiguous crash window.
- A crash **before** confirmed SMTP acceptance can leave a message classified
  `delivery_unknown` **even if it was never delivered**.
- A crash **after** SMTP acceptance but before the DB update can leave it
  `delivery_unknown` **even though the recipient may receive it**.
- `sent` confirms SMTP **acceptance**, which does **not** prove inbox delivery.

On recovery these windows are indistinguishable (a row left `sending` with an
expired lease), so all become `delivery_unknown` and are never auto-resent.

**Immutable attempt history.** Every attempt/transition appends one row to
`marketing_outbox_attempts` (compact enums + ids only — never email, name, body,
subject, address, consent wording, or token). A manual retry **appends** a new
attempt; it never overwrites prior history.

**Owner/admin `delivery_unknown` review workflow:** (1) **resolve** — mark
reviewed without resending; (2) **retry** — deliberately re-queue, with a
prominent duplicate-risk warning (appends a new attempt); (3) **cancel**. Each
manual resolution is audited with compact action + actor id only.

**Final-eligibility boundary (honest).** Suppression/eligibility is rechecked
immediately before each send, so an unsubscribe that commits before that check
stops the message. But an unsubscribe that commits **after** the check and
**before** SMTP acceptance cannot always stop the already-in-flight message —
this is an unavoidable boundary and is documented, not hidden.

## Marketing email safety (S7b-iii)

**HTML is generated, never sanitized.** Tenant marketing bodies are plain text
with a tiny Markdown-like subset (blank-line paragraphs, single-line breaks,
`# ` headings, `**bold**`, `*italic*`, and `[label](http/https)` links). The
HTML alternative is *generated*: every character is HTML-escaped first, then the
fixed subset is applied, so no tenant-authored markup is ever parsed. There is
no regex "sanitizer" over arbitrary HTML. Link URLs are validated with the URL
parser and restricted to http/https; a rejected link renders as inert text.
Every interpolated value (business name, physical address, subject, link labels,
footer) is escaped. An adversarial suite proves script/svg/mathml/iframe/srcdoc/
data/blob/file/tracking-pixel/encoded-`javascript:`/event-handler payloads all
become inert text and only the fixed tag set (`p br hr a strong em h1-3`) with
http/https hrefs can appear.

**Confirmation-token retry (hash-only).** Verify/confirm tokens are stored as
SHA-256 hashes only, so a raw token can't be reconstructed for a retry. A retry
mints a NEW independent raw token (new hash); the bound org/form/sequence/
consent-wording/version never change. Multiple unexpired tokens for one
activation may coexist; the first one to confirm atomically **invalidates all
sibling tokens** for that activation (matched by consent reference), so a later
replacement token can't confirm a second time. Replays are idempotent
(`already_used`); the single-enrollment guarantee is enforced downstream by the
idempotent activation confirm + the enrollment unique index. Restart resumes
from the durable activation record without needing the original raw token. Raw
tokens never appear in logs, audit metadata, ordinary columns, or access logs.

## Account verification vs marketing test — two senders, neither is marketing (S7b-iii b:2d)

Two capabilities are wired as HTTP routes and kept **strictly separate**. Neither
is ever counted as a marketing send (both go out as `transactional`, carry no
`List-Unsubscribe`/one-click headers, and never touch consent, suppression, the
unsubscribe system, the marketing outbox, or metering).

**1. Account-email verification** proves a user controls their *account* email —
a security prerequisite, not marketing consent.

- `POST /api/platform/account/request-verification` — authenticated + CSRF. The
  recipient is the signed-in user's own account email, selected **server-side**;
  the request body takes **no parameters**, so a recipient/redirect override is a
  `400` (nothing is sent). The reply is a **generic `{ok:true}`** whether or not
  a message went out, so it can't probe which accounts exist. The message uses
  the application's **configured, authenticated transactional sender identity**
  (the same From the email service uses) — **never** an invented
  `no-reply@<domain>`. If no approved transactional sender is configured, the
  route **fails closed**: it sends nothing rather than fabricating an address
  (the reply stays generic). The configured address and SMTP details are never
  echoed in public responses, audit metadata, or ordinary logs. The link stays
  on the **trusted platform host** (never a tenant host); the Message-ID domain
  follows the sender's own authenticated domain. An uncertain/failed SMTP attempt
  is **not** auto-resent — the user can request again (rate-limited). Limits are
  layered: per-user, per-email-hash, per-IP, and platform-wide.
- **Domain ownership ≠ sending authentication.** Controlling the web domain does
  **not** prove that any mailbox on it is authorized to send: SPF, DKIM, DMARC,
  PTR/HELO, and SMTP authorization are separate and must be established for the
  transactional sender's domain independently. Sender-domain deliverability is to
  be verified **read-only** during the later documentation/acceptance stage — **no
  DNS is changed here**.
- Active tokens are **bounded but not single**: a resend mints a NEW token bound
  to the same (user, normalized email) **without** invalidating the prior,
  possibly-delivered link — because SMTP acceptance can be uncertain, killing the
  previous link before the replacement is known to have arrived could leave the
  user with no usable email. A small cap (3) is enforced; when it would be
  exceeded the **oldest** token is expired first (deterministically). The first
  sibling to confirm invalidates **all** siblings atomically; an email change
  invalidates every token immediately; replays are idempotent; raw tokens are
  never stored (SHA-256 only).
- `GET /verify-email` / `POST /verify-email` — the neutral **fragment-exchange**
  confirmation page. The token travels only in the URL **fragment**; the page
  calls `history.replaceState` to strip it **before anything else**, then POSTs
  it. `GET` has no side effect (scanner-safe). Headers: `Cache-Control:
  no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex,nofollow`,
  `X-Frame-Options: DENY`, and a restrictive CSP (`default-src 'none'`,
  `frame-ancestors 'none'`, only same-origin `form-action`/`connect-src` and the
  page's own inline style/script) — no third-party scripts, fonts, images, or
  analytics. Messages are generic (expired/invalid/already-used are
  indistinguishable — no account-existence leak). A real-browser (Playwright)
  test proves the fragment is stripped from history, the token never appears in
  any request URL, and no cross-origin request is made.

**2. Marketing-sender test** lets an owner/admin confirm their *marketing* sender
works, using the tenant's resolved+approved identity — but as a one-off
transactional probe to their own inbox.

- `POST /api/platform/marketing/test-email` — authenticated + CSRF, **owner/admin
  only** (members are denied by role even if verified), and the caller's account
  email must be **verified** (fail-closed `403 EMAIL_UNVERIFIED`). The recipient
  is the caller's own verified address, server-side; a recipient override is a
  `400`. It resolves the tenant marketing sender (`MarketingSenderService`, which
  fails closed with a compliance action item) and sends via the existing SMTP
  `EmailDeliveryProvider`. It is clearly labeled a test, has **no** unsubscribe
  link/token and **no** marketing headers, and produces **no** lead / consent /
  activation / enrollment / suppression / sequence / outbox / metering side
  effect. The response is an **honest, sanitized** status only —
  `accepted` (took responsibility, *not* proof of inbox placement) /
  `rejected` / `pre_acceptance_failure` / `uncertain` — plus a coarse category
  and a human message. Raw SMTP responses, addresses, bodies, and credentials
  are never exposed.

## Submission → activation → confirmation dispatch (S7b-iii b:3)

Public submission now wires marketing **activation** and a durable, **transactional**
double-opt-in **confirmation dispatch** — while keeping the lead (and the future
lead magnet) completely independent.

- **Forced-opt-in policy.** `resolveOptInPolicy` is consulted per submission. A
  trustworthy, allowlisted browser Origin honors the tenant's single/double
  choice; **no Origin / `Origin: null` / `allowAnyOrigin` FORCE double opt-in**.
  The lead and lead magnet still proceed either way — only an immediately-active
  marketing enrollment is withheld until the recipient confirms.
- **Activation intent.** On granted consent AND a configured target
  `consent.sequenceId`, a durable `marketing_activations` intent is created,
  binding the EXACT terms accepted (org, formId, email, consent version). Single
  opt-in → `ready`; double opt-in → `awaiting_confirmation`. With no sequence
  configured, consent + lead are still recorded but no activation exists
  (fail-closed marketing).
- **Durable confirmation dispatch (`confirmation_dispatch`).** Separate from the
  marketing outbox because a confirmation email is **transactional**: it carries
  the tenant's sender identity + physical address but **no List-Unsubscribe /
  one-click headers** and is **never metered** as a marketing send. Keyed by
  activation (idempotent — a repeat submission never double-sends). Crash-safe
  with honest states (`queued`/`sending`/`sent`/`failed`/`terminal`/
  `delivery_unknown`): a crashed lease or an ambiguous transport result becomes
  `delivery_unknown` and is **never blind-resent**; `uncertain` acceptance never
  auto-retries; a deliberate retry mints a **brand-new** token (no raw token is
  ever stored — each attempt mints fresh). Fails closed when the tenant's
  marketing sender isn't configured.
- **Bound confirmation.** `POST /marketing/confirm` validates the token, records
  confirmed consent, AND flips the activation `awaiting→ready` — but only the
  activation whose exact bound terms the token carries. Enrollment itself is done
  later by the activation worker, which re-checks every gate (consent, suppression,
  lead-active, the bound sequence still valid) before enrolling.
- **Independence & isolation.** The activation/dispatch block is wrapped so a
  failure never blocks the CRM lead; everything runs inside the form owner's
  tenant scope (`runWithTenant`), so nothing crosses tenants. Submission replies
  stay generic (`confirmationMessage`) — enumeration-safe.
- **Unsubscribe headers** appear only on actual marketing messages (the drip
  sends via the marketing outbox / `buildMarketingEmail`), never on the
  verification, sender-test, or confirmation emails.

The periodic dispatch/enrollment **worker** (limits, concurrency, transactional>
marketing priority, auto-pause) is deferred to the operational-safeguards stage;
until then the durable rows queue safely and inertly.

## Current status of the build

- Fail-closed: public forms create the CRM lead only; **marketing enrollment is
  blocked** pending the consent/unsubscribe/suppression core (this is by
  design — see the gap report in the change history).
- XSS-safe: the hosted form page and this example render remote copy as text.
- (Further sections — per-form CORS/abuse, consent + double opt-in, suppression
  + unsubscribe + eligibility, attribution + merge, lead-magnet delivery — are
  documented here as each stage lands.)
