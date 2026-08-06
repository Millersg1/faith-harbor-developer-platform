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

## Current status of the build

- Fail-closed: public forms create the CRM lead only; **marketing enrollment is
  blocked** pending the consent/unsubscribe/suppression core (this is by
  design — see the gap report in the change history).
- XSS-safe: the hosted form page and this example render remote copy as text.
- (Further sections — per-form CORS/abuse, consent + double opt-in, suppression
  + unsubscribe + eligibility, attribution + merge, lead-magnet delivery — are
  documented here as each stage lands.)
