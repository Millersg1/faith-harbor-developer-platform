/**
 * DRAFT, versioned Domain Registration Terms for All Elite Cloud.
 *
 * This is a DRAFT and is NOT attorney-approved. It is intentionally kept
 * UNPUBLISHED: the body contains `LEGAL REVIEW REQUIRED` markers that the
 * server-side publish guard (`LegalMarkerError`) refuses to publish, so it
 * cannot go live until an attorney/owner removes the markers after review.
 *
 * The deploy step (later, with approval) would call
 *   legalService.seedIfEmpty([DOMAIN_REGISTRATION_TERMS_SEED])
 * to create the draft (kind `domain-registration`, version 1, unpublished).
 * Nothing here publishes or activates acceptance.
 */

export interface DomainTermsSeed {
  kind: "domain-registration";
  title: string;
  summary: string;
  bodyMarkdown: string;
  publish: false;
}

const BODY = `# Domain Registration Terms (DRAFT — NOT attorney-approved)

LEGAL REVIEW REQUIRED — this draft must be reviewed by counsel before publication.

## 1. Roles
The accredited registrar of record for domains registered through this service is
**NameSilo, LLC** (an ICANN-accredited registrar). **All Elite Cloud (a service of
Faith Harbor LLC) is the reseller and management provider only, and is NOT an
ICANN-accredited registrar.** You, the customer, are the **registered name holder
(the legal registrant)** of any domain you register.

## 2. Accurate registrant information
You must provide accurate, current registrant, administrative, technical, and
billing contact information, keep it up to date, and **respond to any required
verification requests** (including registrant email verification). Your contact
information is transmitted to and processed by the registrar and the applicable
registry as required to register and maintain the domain.

## 3. Privacy
WHOIS/RDAP privacy is applied **where the TLD and registrar support it**. Privacy
**cannot be promised for every TLD**, and certain registry/registrar/legal
requirements may require disclosure of your information. Privacy does not replace
your obligation to provide accurate registrant data.

## 4. Availability and pricing
Domain availability and quoted pricing are **not guaranteed until registration
succeeds**. Registration, renewal, transfer, restoration/redemption, registry
fees, and any applicable taxes are shown **separately** and honestly. Promotional
first-year registration pricing, where offered, is **not** the ongoing renewal
price. **Premium-domain prices require your explicit confirmation** before
purchase. LEGAL REVIEW REQUIRED — pricing, fees, and tax language.

## 5. Payment, registration, and refunds
A successful payment **does not by itself guarantee registration**. If a
registration **definitively fails**, you receive the documented refund treatment.
If a provider outcome is **ambiguous**, we investigate and reconcile it before any
registration or refund is repeated. LEGAL REVIEW REQUIRED — refund terms and
timing.

## 6. Registry / ICANN restrictions
Registration and transfer restrictions — including applicable waiting periods —
may be imposed by ICANN, the registry, or the registrar. Unsupported TLD features
**fail closed** (they are not offered) rather than behaving unpredictably.

## 7. Authorization (EPP) codes and transfers
EPP/authorization codes are handled **only through the registrar's approved
process** and are **never exposed to unauthorized tenant members**. You retain the
right to **transfer your domain away**, subject to applicable registrar, registry,
and ICANN rules and any unpaid lawful charges. LEGAL REVIEW REQUIRED — transfer
rights and dispute language.

## 8. Renewal, expiration, and loss
Auto-renew behavior is applied only when you explicitly choose it. Renewal timing,
expiration notices, grace periods, redemption, and the **possible loss of a
domain** are disclosed **based on the applicable registrar/registry policy — we do
not invent universal deadlines**, because they vary by TLD.

## 9. Your service vs. your domain
**Cancelling your All Elite Cloud service or deleting your tenant does NOT cancel,
surrender, or delete a registered domain.** Domain ownership and domain billing
are separate from your subscription. LEGAL REVIEW REQUIRED — liability and
disputes.

## 10. Abuse and lawful use
Abuse, court orders, registry policies, and ICANN requirements may restrict or
suspend a domain.

## 11. Security notices
Registrar security features (such as "Domain Defender") provide additional
protection but **do not prevent all unauthorized changes**; no such guarantee is
made.

## 12. Incorporated agreements
Your registration is also subject to the registrar's (NameSilo) registration
agreement and applicable ICANN policies. LEGAL REVIEW REQUIRED — incorporation and
registrant-data processing language.

## 13. Automatic renewal authorization
Automatic renewal is **opt-in and off by default**. If you enable it, you provide
an **explicit, durable authorization** to charge a saved payment method
off-session for future renewals, and that authorization is recorded as consent
evidence. **All Elite Cloud never renews your domain using its own funds** — an
automatic renewal proceeds only after a **successful customer payment**. The
**renewal price is re-checked before each charge and may change**; a promotional
price is never treated as the ongoing renewal price. If no eligible authorized
payment method exists, you are offered a manual checkout instead. You may turn off
automatic renewal at any time; **turning it off never cancels, deletes,
surrenders, unlocks, or transfers your domain.** We do **not** enable the
registrar's own account-balance auto-renew on your behalf. LEGAL REVIEW REQUIRED —
recurring-authorization, mandate, and consent-evidence language.

## 14. DNS and nameserver management
DNS record management, registrar nameserver delegation, and registry DNSSEC/glue
are **separate** capabilities. We manage DNS **records** only when your domain is
using a DNS service we operate and that authority is **freshly verified**; domains
delegated to third-party or hosting nameservers are shown as **externally
managed**. We do **not** change your nameservers automatically as part of
purchase, hosting attachment, renewal, or transfer. Changes to mail (MX), sender
authentication (SPF/DKIM/DMARC), and certificate (CAA/ACME) records are protected
and require explicit confirmation. **DNS propagation is never instant** and no
propagation time is guaranteed. LEGAL REVIEW REQUIRED — DNS/hosting responsibility
and limitation language.

## 15. Transfers away
You may transfer your domain to another registrar. Unlocking and requesting an
authorization (EPP) code are **deliberate, separately-confirmed** actions. Where
the registrar delivers the authorization code by emailing the registrant, we
**cannot display a code we do not receive**. We do **not** obstruct a lawful
transfer-away, and nothing here implies All Elite Cloud owns your domain.
Transfer timing is set by the registries/registrars involved and **cannot be
guaranteed**. LEGAL REVIEW REQUIRED — transfer-away and inter-registrar dispute
language.
`;

export const DOMAIN_REGISTRATION_TERMS_SEED: DomainTermsSeed = {
  kind: "domain-registration",
  title: "Domain Registration Terms",
  summary:
    "How domain registration works through All Elite Cloud: NameSilo is the registrar of record, you are the legal registrant, and pricing, refunds, renewals, transfers, and loss risks are disclosed honestly. DRAFT — pending legal review.",
  bodyMarkdown: BODY,
  publish: false,
};

/** Sections a reviewing attorney must sign off before publication. */
export const DOMAIN_TERMS_ATTORNEY_REVIEW_ITEMS = [
  "refunds",
  "renewal/expiration language",
  "liability",
  "disputes",
  "registrant-data processing",
  "transfer rights",
  "incorporation of NameSilo/ICANN agreements",
] as const;
