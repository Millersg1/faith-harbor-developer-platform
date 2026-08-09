# Email deliverability & authentication (S7b)

This document is **operational guidance and a verification checklist**, not a set
of changes to apply now. It describes what must be true about DNS and the mail
transport for marketing + transactional email to authenticate and deliver, and
how the platform's provider-independent send boundary migrates from the current
SMTP transport to a dedicated provider (Mailgun) later.

> **No DNS, SMTP, or infrastructure change is made by this document.** Every
> record below is to be **verified read-only** during the deployment /
> acceptance stage. The autoresponder is not "operational" until the checks here
> pass for the actual sending domain(s) (see the pre-deployment report).

## Why this matters (honesty boundary)

The platform classifies a send as `accepted` when the receiving SMTP server takes
responsibility for the message — that is **not** proof of inbox placement.
Authentication (SPF/DKIM/DMARC) and reputation (PTR, TLS, warmup, complaint
rates) are what move an `accepted` message toward the inbox. None of that is
inferred by the code; it is established at the DNS/transport layer and observed
externally.

## Sending identities

Two distinct concerns, already separated in the code:

- **Platform transactional sender** — the configured, authenticated From used for
  account verification (`transactionalSender` / `SMTP_FROM`) and confirmation
  dispatch. Runs on an AEC-controlled domain.
- **Tenant marketing sender** — resolved per tenant by `MarketingSenderService`.
  A tenant's own From ADDRESS is honored only when its domain is
  platform-approved for sending (`sendingDomainApproved`); otherwise a
  platform-controlled From on an authenticated AEC domain is used, carrying the
  tenant's business name, with the tenant's validated address as Reply-To.

**Owning a web domain is NOT sending authentication.** SPF/DKIM/DMARC/PTR/HELO/
SMTP authorization for the *sending mailbox/domain* are separate and must be
established independently for every domain that appears in a From/Return-Path.

## The records to verify (read-only)

For each **sending domain** (the AEC transactional domain, and any tenant domain
marked `sendingDomainApproved`):

### SPF (envelope / Return-Path authorization)
- A single `TXT` SPF record on the sending/Return-Path domain that authorizes the
  actual sending host(s). Example shape (verify, do not blindly copy):
  `v=spf1 include:<provider-or-host> -all` (use `-all` hardfail once the set of
  senders is known and stable; `~all` softfail during bring-up).
- Verify only ONE SPF record exists (multiple SPF TXT records is a hard failure).
- Verify SPF aligns with the Return-Path used by the transport.

### DKIM (cryptographic signature)
- A DKIM public-key `TXT` record at `<selector>._domainkey.<domain>` matching the
  private key the transport signs with. cPanel/Exim publishes a `default`
  selector key; a dedicated provider (Mailgun) uses its own selector(s).
- Verify the signature validates for a real test message (external tool), and
  that the signing domain (`d=`) aligns with the From domain.

### DMARC (alignment policy + reporting)
- A `TXT` record at `_dmarc.<domain>`. Start in observe mode and tighten:
  `v=DMARC1; p=none; rua=mailto:dmarc@<domain>; fo=1` → after confirming SPF+DKIM
  alignment across all senders, move to `p=quarantine` then `p=reject`.
- Verify **alignment**: DMARC passes only when SPF (Return-Path) OR DKIM (`d=`)
  aligns with the visible From domain. The platform-fallback-From design exists
  precisely so alignment holds when a tenant domain isn't approved.

### PTR (reverse DNS) + HELO
- The sending IP must have a `PTR` record resolving to a hostname that itself
  forward-resolves back to that IP (FCrDNS).
- The SMTP `HELO`/`EHLO` name should match that PTR hostname and be a valid FQDN.
  On the current cPanel host these are set by the hosting environment — verify,
  don't assume.

### TLS
- Outbound STARTTLS must be used and certificate validation must not be
  downgraded. The `SmtpEmailDeliveryProvider` treats TLS/handshake errors as
  `pre_acceptance_failure` and never falls back to an insecure channel — verify
  the transport is configured for verified TLS (port 465/587, cert checks on).

### Additional hygiene (verify)
- Valid `From`, `Reply-To`, and a real physical mailing address in marketing
  bodies (already enforced by `buildMarketingEmail`).
- RFC-8058 `List-Unsubscribe` + one-click on marketing only (already enforced);
  never on transactional/verification/confirmation/test email.
- A monitored `abuse@`/`postmaster@` and DMARC `rua` mailbox.

## Current transport vs. provider migration (Mailgun)

The send boundary is `EmailDeliveryProvider` (transport-agnostic). Today the
concrete implementation is `SmtpEmailDeliveryProvider` over the existing cPanel
Exim SMTP mailbox — **no second sending path, no new credentials**. Everything
above the boundary (consent, suppression, double opt-in, sequences, enrollments,
the outbox, limits, retries, crash recovery, unsubscribe, metering, audit) is
already provider-independent.

### Why a dedicated provider later
Shared cPanel/Exim IPs have limited, opaque throughput and shared reputation. A
dedicated provider gives per-domain DKIM, dedicated/managed IPs, suppression
webhooks, and observable events — better for marketing volume without risking the
transactional reputation.

### Migration plan (future, not executed here)
1. Add a `MailgunEmailDeliveryProvider implements EmailDeliveryProvider` — the
   ONLY new code needed; nothing above the boundary changes. It maps Mailgun
   responses to the same honest classifications
   (`accepted`/`rejected`/`pre_acceptance_failure`/`uncertain`).
2. Provision the provider domain: publish its DKIM selector(s), SPF `include:`,
   and a tracking/Return-Path domain; verify DMARC alignment.
3. Warm up: start low volume, watch complaint/bounce signals, raise gradually.
4. Keep **transactional** on the authenticated AEC transactional sender
   (separate reputation) unless/until deliberately moved.
5. Select the provider by configuration — no code fork above the boundary.
6. Re-run this entire checklist for the provider's sending domain before volume.

### Deliverability capacity vs. the app's limits
The marketing worker's per-tenant/platform hourly/daily caps
(`DEFAULT_MARKETING_LIMITS`) are **conservative, configurable placeholders — not a
measured capacity claim**. Before production volume, compare them **read-only**
against the real transport limits:
- Exim/cPanel: `max_recipients`, per-hour/day relay caps, queue/retry behavior,
  and any host `Max hourly emails` setting.
- Mailgun (if adopted): plan send limits, rate limits, and per-domain reputation.
Set the app caps at or below the transport's safe throughput; never above.

## Verification checklist (run read-only at acceptance)
- [ ] Exactly one SPF record per sending domain; authorizes the real sender; alignment OK.
- [ ] DKIM validates; `d=` aligns with From.
- [ ] DMARC present; alignment confirmed; policy tightening plan agreed.
- [ ] PTR/FCrDNS + HELO FQDN correct for the sending IP.
- [ ] Verified TLS outbound; no insecure fallback.
- [ ] List-Unsubscribe/one-click present on marketing only; physical address present.
- [ ] abuse@/postmaster@/DMARC-rua mailboxes monitored.
- [ ] App marketing caps compared to, and ≤, the transport's real limits (documented numbers).
- [ ] A small set of explicitly-approved test sends observed end-to-end before enabling volume.
