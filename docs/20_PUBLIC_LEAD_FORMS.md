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

## Current status of the build

- Fail-closed: public forms create the CRM lead only; **marketing enrollment is
  blocked** pending the consent/unsubscribe/suppression core (this is by
  design — see the gap report in the change history).
- XSS-safe: the hosted form page and this example render remote copy as text.
- (Further sections — per-form CORS/abuse, consent + double opt-in, suppression
  + unsubscribe + eligibility, attribution + merge, lead-magnet delivery — are
  documented here as each stage lands.)
