import type { LegalSeed } from "../PlatformLegalService";

/**
 * Seed content for All Elite Cloud's platform legal documents (Version 1.0).
 *
 * This is the owner-reviewed Version 1.0 release. Every document is clean,
 * complete, public text — no internal review blocks, no "draft"/"interim"
 * markers, no owner-decision notes (a server-side publication guard also
 * refuses any body containing such markers). All eight seed with publish:true
 * and are served at /legal/*.
 *
 * Owner-reviewed, NOT attorney-approved. Attorney review remains scheduled;
 * when received, material changes create a NEW immutable version (Version 1.0
 * is never overwritten) and trigger re-consent where appropriate.
 *
 * Verified facts baked in: operator Faith Harbor LLC, an Ohio LLC (Ohio SoS
 * Articles of Organization, effective 2024-10-09); product All Elite Cloud;
 * Ohio governing law, no mandatory arbitration, no class-action waiver, no
 * customer indemnification in v1.0, 12-month aggregate liability cap; 18+
 * business users; generally non-refundable; cancellation at period end (Stripe
 * portal mode at_period_end verified); contact legal@allelitecloud.com
 * (owner-confirmed as receiving mail); infrastructure provider Cloud South
 * (West Palm Beach, FL). Retention/backup text states only conservative,
 * enforced, or genuinely operational behavior.
 */

const CONTACT = "legal@allelitecloud.com";

// ---------------------------------------------------------------------------
// PUBLISHED — fully derived from verified application behavior.
// ---------------------------------------------------------------------------

const COOKIES = `## What cookies we use

All Elite Cloud uses a small number of cookies. As of the effective date above, the platform sets **only strictly-necessary cookies** that keep you signed in and secure your session. We do **not** use advertising cookies, and we do **not** load third-party analytics or marketing trackers on the platform.

Because we use only strictly-necessary cookies, we do not show a tracking-consent banner. If that ever changes, we will update this policy and ask for consent before loading any non-essential cookie.

## The cookies we set

- **aec_session** — keeps you signed in to your workspace. Strictly necessary. Set after you sign in; expires after about 7 days or when you sign out. Marked HttpOnly and SameSite=Lax, and sent only over HTTPS in production.
- **aec_admin** — signs in All Elite Cloud staff to the platform administration console. Strictly necessary; only set for platform administrators. Expires after about 12 hours. HttpOnly, SameSite=Lax, HTTPS-only in production.
- **aec_portal** — keeps a client-portal guest signed in when a customer invites their own client. Strictly necessary; only set when you use the client portal. Expires after about 7 days. HttpOnly, SameSite=Lax, HTTPS-only in production.

All three are first-party cookies, tied to the host you are visiting, and cannot be read by page scripts.

## Cookies on websites built with All Elite Cloud

Websites that our customers create and publish are their own. A customer may add their own cookies or third-party tools to their website; those are governed by that customer's own cookie and privacy notices, not this one.

## Managing cookies

You can clear or block cookies in your browser settings. Because our cookies are strictly necessary, blocking them will prevent you from signing in.

## Contact

Questions about this policy: [${CONTACT}](mailto:${CONTACT}).`;

const AI_POLICY = `## Overview

All Elite Cloud includes AI-assisted features, including an AI assistant ("Command Center") and AI-assisted website generation. This policy explains, in plain terms, how those features work and the role of human review.

## Which AI providers we use

AI features are powered by third-party AI providers that expose an OpenAI-compatible interface — currently **OpenAI** and/or **OpenRouter**. You may supply your own provider API key for your organization; if you do not, eligible AI features may use an All Elite Cloud-managed key where available. If no key is configured, AI features are unavailable rather than silently degraded.

See our [Subprocessor List](/legal/subprocessors) for the third parties that process data on our behalf.

## What is sent to the AI provider

When you use an AI feature, the content you provide for that task is sent to the AI provider to produce a result. For example:

- **Website generation** sends the business name, the description you enter, and an optional accent color.
- **The AI assistant** sends your message, recent conversation turns, and — when you ask it to look something up — the results of read-only actions against your own workspace data (such as leads, clients, projects, or invoices).

We do not sell your content. How the AI provider itself handles data it receives is governed by that provider's terms; any statement about provider training or retention rests on the provider, not on claims we invent. Review your provider's terms and configure your own key if you require specific data-handling commitments.

## Human review is required

AI output can be wrong, incomplete, or unsuitable for your purpose. **You are responsible for reviewing AI-assisted output before you rely on it or publish it.** This is especially important for legal, financial, medical, or other consequential content.

For actions that change your data, the assistant operates with a human in the loop: it can run read-only lookups on its own, but any action that would create, change, or delete data is queued as a proposal that a person must review and confirm. The assistant cannot modify your data on its own.

## Generated legal templates are not legal advice

Legal-document templates that All Elite Cloud helps you generate are general informational starting points, not legal advice. Laws and business practices vary. Review generated documents carefully and consult a qualified attorney when appropriate.

## Contact

Questions about this policy: [${CONTACT}](mailto:${CONTACT}).`;

const ACCEPTABLE_USE = `## Purpose

This Acceptable Use Policy describes conduct that is not allowed when using All Elite Cloud. It supplements our [Terms of Service](/legal/terms). We may update it as needed to keep the service safe and lawful.

## You may not

- Break the law, or use the service to help others break the law.
- Infringe intellectual-property or privacy rights.
- Upload or distribute malware, or attempt to gain unauthorized access to any system, account, or data — yours or anyone else's.
- Attempt to access, read, or interfere with another organization's data on the platform.
- Send unlawful, deceptive, or unsolicited bulk messages ("spam"), or use the service to phish or defraud.
- Publish or transmit content that is unlawful, harassing, hateful, or that sexually exploits or endangers minors.
- Probe, scan, or test the vulnerability of the platform, or defeat rate limits, authentication, or other protections, without our prior written permission.
- Overload or disrupt the service, including through excessive automated requests.
- Misrepresent your identity or your authority to act for an organization.
- Resell or expose the platform to third parties in a way the Terms do not permit.

## Your content and responsibilities

You are responsible for the content you upload, generate, and publish, and for your end users' use of websites you create. You must have the rights necessary to use that content, and you must comply with laws that apply to your business and audience.

## Enforcement

We may investigate suspected violations and may suspend or terminate access as described in the Terms of Service. We may remove or disable content that we reasonably believe violates this policy or the law.

## Reporting abuse

Report suspected abuse to [${CONTACT}](mailto:${CONTACT}).`;

const ACCESSIBILITY = `## Our commitment

We want All Elite Cloud to be usable by as many people as possible, including people who use assistive technology. We aim to align the platform interface with the **Web Content Accessibility Guidelines (WCAG) 2.2, Level AA** as a design target.

This statement describes our goal and our current practice. It is not a certification or a guarantee that every part of the service meets every success criterion at all times.

## What we do

- Use semantic structure and landmark roles so screen readers can navigate pages.
- Provide accessible names for icon-only controls, and visible keyboard focus states.
- Support keyboard navigation for interactive components such as tabbed workspaces.
- Design for color contrast and for reduced-motion preferences.
- Lay out pages responsively for a range of screen sizes.

## Known limitations

Accessibility is ongoing work. Some areas may not yet fully meet our target, and content that customers create on their own websites is outside our control.

## Websites built with All Elite Cloud

Customers are responsible for the accessibility of the websites they generate and publish. We provide structure intended to support accessibility, but the final content and choices are the customer's.

## Feedback and help

If you encounter an accessibility barrier, or need information in a different format, contact [${CONTACT}](mailto:${CONTACT}) and describe the problem and the page. We will do our best to help and to prioritize fixes.`;

// ---------------------------------------------------------------------------
// OWNER-REVIEWED (Version 1.0) — completed with the owner's confirmed positions
// and code/record verifications (entity, contact mailbox, Stripe at_period_end,
// Cloud South). Clean public text only; the server-side publication guard
// refuses any body containing internal markers. Owner-reviewed, not attorney-
// approved; attorney review creates a new version when received.
// ---------------------------------------------------------------------------

const TERMS = `## About these terms

These Terms of Service ("Terms") are an agreement between you and Faith Harbor LLC ("Faith Harbor," "we," "us," "our"), the company that operates the All Elite Cloud platform ("All Elite Cloud," the "Service") at [https://allelitecloud.com](https://allelitecloud.com). All Elite Cloud is a software product operated by Faith Harbor LLC, an Ohio limited liability company. By creating an account or using the Service, you agree to these Terms.

## Eligibility

All Elite Cloud accounts are intended for business use. You must be at least 18 years old and able to enter into a binding contract to use the Service. You may not create or independently operate an account if you are under 18.

## Your account

You must provide accurate information and keep your credentials secure. You are responsible for activity under your account and for your team members' and authorized users' use of the Service.

## The Service

All Elite Cloud provides a multi-tenant business platform, including workspace tools, AI-assisted features, and website generation and hosting. Features and plans may change over time.

## Subscriptions and payment

Paid plans are billed through Stripe. Billing, renewal, cancellation, refunds, and failed-payment handling are described in the [Subscription, Cancellation, and Refund Policy](/legal/subscriptions).

## Your content

You retain ownership of the content you upload, generate, and publish ("your content"). You grant us the limited license needed to host, process, and display your content to operate the Service for you — for example, storing your files, rendering your website, and sending content you direct us to send. You are responsible for your content and for having the rights necessary to use it.

## Our intellectual property

Faith Harbor and its licensors own and retain all rights in the All Elite Cloud software, platform design, platform branding, documentation, templates and other platform-provided materials, and the underlying technology and intellectual property (collectively, the "Platform Materials"). Your subscription grants you a limited, non-exclusive, non-transferable right to use the Service during your subscription — it does not transfer ownership of the Platform Materials to you. Your ownership of your content is separate from, and does not include, the Platform Materials, platform-provided templates, or the software and generated service components used to operate the Service.

## AI-assisted features

AI features are subject to the [AI Use and Human Review Policy](/legal/ai-policy). AI output can be wrong or unsuitable, and you are responsible for reviewing AI-assisted output before relying on or publishing it.

## Acceptable use

Your use must comply with the [Acceptable Use Policy](/legal/acceptable-use).

## Custom domains and hosting

You are responsible for domains you connect and for the content you publish. We provision TLS certificates automatically after a domain verifies. We do not guarantee a specific uptime percentage.

## Suspension and termination

We may suspend or terminate access for violations of these Terms or the Acceptable Use Policy, or as needed to protect the Service or comply with law. You may stop using the Service at any time.

## Data export and deletion

You may request export or deletion of your data as described in our [Privacy Policy](/legal/privacy). Some records may be retained where required for legal, tax, security, or fraud-prevention reasons.

## Disclaimers

To the fullest extent permitted by law, the Service is provided on an "as is" and "as available" basis. We do not warrant that AI output is accurate, complete, or suitable without human review; that the Service will be uninterrupted or error-free; or that you will achieve any business, marketing, revenue, search-ranking, or website-performance result.

## Limitation of liability

To the fullest extent permitted by law, Faith Harbor will not be liable for indirect, incidental, special, consequential, or lost-profit damages. Our total aggregate liability for any claim is limited to the fees you paid to All Elite Cloud during the twelve (12) months before the event giving rise to the claim. Nothing in these Terms limits liability that cannot be limited under applicable law.

## Governing law and disputes

These Terms are governed by the laws of the State of Ohio, without regard to its conflict-of-laws rules. You and Faith Harbor agree to the exclusive jurisdiction of the state and federal courts serving Faith Harbor LLC's principal place of business in Ohio for any dispute not otherwise resolved.

## Changes

We may update these Terms. Material changes will be posted here with a new effective date, and where appropriate we will ask you to re-accept.

## Contact

Questions: [${CONTACT}](mailto:${CONTACT}).`;

const PRIVACY = `## Introduction

Faith Harbor LLC ("Faith Harbor," "we," "us," "our") operates the All Elite Cloud platform. This Privacy Policy explains what information we collect, why, who we share it with, and the choices you have.

## Our roles

For account registration, authentication, billing, security, support, and platform administration, Faith Harbor acts as the business (controller). For content a tenant enters about its own clients, leads, contacts, employees, customers, or website visitors, Faith Harbor generally acts as a service provider (processor) operating the platform on that tenant's instructions.

## Information we collect

- **Account and team information:** organization name, your name, email address, and team invitations.
- **Authentication and security data:** session cookies (see the [Cookie Policy](/legal/cookies)), IP address, and authentication and security log entries used to operate and protect the Service and to rate-limit abuse.
- **Support communications** you send us.
- **Tenant business content** you create in the workspace: CRM clients, contacts, and leads; projects; support tickets; invoices; websites; uploaded files; marketing campaigns; and knowledge-base content.
- **Custom domain and hosting information** for domains you connect.
- **AI data:** the prompts and content you submit to AI features, AI responses, conversation history, your chosen AI provider, and usage metering.
- **Billing information:** handled by Stripe. We store Stripe identifiers (customer and subscription IDs) and your plan and status; we do **not** receive or store your full card number.
- **Email data:** transactional messages and, where you configure them, tenant-directed marketing messages.
- **Compliance evidence:** privacy-request records and legal-acceptance records.

Tenant-directed marketing communications are sent on the tenant's instructions. Tenants are responsible for lawful recipient consent, message content, honoring unsubscribe requests, and complying with applicable marketing laws.

## How we use information

To provide and secure the Service, authenticate you, process payments through Stripe, send transactional and (where you configure them) marketing messages, provide AI-assisted features, and maintain reliability.

## Selling and sharing

All Elite Cloud does **not** sell personal information, and does **not** share personal information for cross-context behavioral advertising. The platform uses no advertising or marketing tracking cookies. We disclose personal information only as necessary to operate, secure, support, and lawfully administer the Service — including to the providers in our [Subprocessor List](/legal/subprocessors), and when required by law. We do not claim your content is "never shared": processors such as payment, AI, email, and infrastructure providers receive data to perform the services you request.

## Data retention

We keep information only as long as needed for the purposes above:

- **Deleted files:** when you delete a file it is recoverable for up to 30 days and is then purged from the active production database, including its stored contents.
- **Password-reset and verification tokens:** expire on a short timer and are never usable after expiry.
- **Sessions:** expire and are removed according to the session lifecycle.
- **Other account and operational data** (including your workspace content, security and audit logs, support records, billing records, and legal-acceptance evidence) is retained while your account is active and for as long as reasonably necessary for the purposes described above and to meet our legal, tax, accounting, security, and fraud-prevention obligations. You may request deletion of your personal information at any time (see "Your choices and rights"); we will honor the request except where we are required or permitted by law to retain specific records.
- **Backups:** deleted information may remain temporarily in operational backups maintained for security, continuity, and disaster recovery. Backup copies are not returned to ordinary production use except when reasonably necessary for recovery, and they are removed or overwritten through the normal backup lifecycle.

## AI features

When you use an AI feature, the content you provide for that task is sent to an AI provider. See the [AI Use and Human Review Policy](/legal/ai-policy).

## Your choices and rights

You may request access to, correction of, or deletion of your personal information, opt out where applicable, or raise a privacy question, through our privacy-request channel or by contacting [${CONTACT}](mailto:${CONTACT}). We may need to verify your identity first. We will not delete records we are required to keep for legal, tax, security, or fraud-prevention reasons.

## Children

All Elite Cloud accounts are intended for business users who are at least 18 years old. The Service is not directed to children, and children may not create or independently operate accounts. Tenant organizations are responsible for ensuring that information they enter about other individuals, including minors, is collected and processed lawfully. This age restriction alone is not a claim of COPPA compliance.

## Changes

We may update this policy and will post changes here with a new effective date.

## Contact

[${CONTACT}](mailto:${CONTACT}).`;

const SUBSCRIPTIONS = `## Plans and billing

Paid plans are billed through **Stripe**. When you choose a paid plan, checkout and card entry happen on Stripe's hosted pages. We store only Stripe identifiers and your plan and status — we never receive or store your full card number.

## Prices and terms

Prices, the billing interval, and material subscription terms are shown before you purchase.

## Automatic renewal

Subscriptions renew automatically each billing period through Stripe until cancelled.

## Cancellation

You may cancel through the Stripe Billing Portal in your workspace. Cancellation prevents future renewal. Your paid plan access continues through the end of the current paid billing period, unless the subscription is terminated for cause.

## Refunds

Payments are generally non-refundable. We do not provide prorated refunds or credits for unused time, partial periods, downgraded plans, or unused features. Exceptions may be made where required by law, for a verified duplicate charge, or for a confirmed billing error. Any discretionary refund does not create an ongoing entitlement.

## Failed payments

If a payment fails, your subscription follows our documented grace-period and recovery workflow: access is retained while the payment is retried, and only a definitive cancellation reduces your plan. A payment failure never automatically deletes tenant data.

## Trials and guarantees

We do not offer a free trial, refund window, money-back guarantee, or guaranteed service credit unless it is actually configured and disclosed to you at purchase.

## Contact

Billing questions: [${CONTACT}](mailto:${CONTACT}).`;

const SUBPROCESSORS = `## About this list

To operate All Elite Cloud, Faith Harbor LLC uses a small number of third-party service providers ("subprocessors") that may process customer or account data on our behalf. This page lists the providers our software actually integrates with.

Last reviewed: see the effective date above.

## Subprocessors

- **Stripe** — Purpose: payment processing, subscription billing, and the billing portal. Data: billing and payment information you enter on Stripe's hosted pages, plus billing identifiers and status. Reference: [https://stripe.com/privacy](https://stripe.com/privacy).
- **OpenAI** — Purpose: AI processing for AI-assisted features, when those features are used and OpenAI is the selected provider. Data: the task content you submit to those features. Reference: [https://openai.com/policies/privacy-policy](https://openai.com/policies/privacy-policy).
- **OpenRouter** — Purpose: AI routing and processing for AI-assisted features, when those features are used and OpenRouter is the selected provider. Data: the task content you submit to those features. Reference: [https://openrouter.ai/privacy](https://openrouter.ai/privacy).
- **[Cloud South](https://www.cloudsouth.com/)** — Purpose: provides the underlying server hosting, cloud infrastructure, network connectivity, and data-center services used by All Elite Hosting to operate All Elite Cloud, including the production application server, the PostgreSQL database, and the outbound SMTP service. Data processed: account information, tenant workspace content, application data, databases, files, logs, and transactional email data stored or processed through the hosted infrastructure. Primary processing location: West Palm Beach, Florida, United States.

Where you configure your own AI provider key, that AI provider is engaged under your own account and terms rather than as our subprocessor.

All Elite Hosting is the customer-facing hosting service operated by Faith Harbor LLC and is not a separate third-party subprocessor.

## Updates

We maintain this list as a versioned document and update it as our providers change.

## Contact

Questions: [${CONTACT}](mailto:${CONTACT}).`;

export function platformLegalSeeds(): LegalSeed[] {
  return [
    {
      kind: "cookies",
      title: "Cookie Policy",
      summary:
        "How All Elite Cloud uses cookies. In short: only strictly-necessary cookies that keep you signed in — no advertising or third-party tracking, and so no consent banner.",
      bodyMarkdown: COOKIES,
      publish: true,
    },
    {
      kind: "ai-policy",
      title: "AI Use and Human Review Policy",
      summary:
        "How our AI-assisted features work, what is sent to AI providers, and why you must review AI output. Data-changing actions always require human confirmation.",
      bodyMarkdown: AI_POLICY,
      publish: true,
    },
    {
      kind: "acceptable-use",
      title: "Acceptable Use Policy",
      summary:
        "The conduct that is not allowed when using All Elite Cloud, and how we enforce it.",
      bodyMarkdown: ACCEPTABLE_USE,
      publish: true,
    },
    {
      kind: "accessibility",
      title: "Accessibility Statement",
      summary:
        "Our commitment to accessibility, the standard we aim for (WCAG 2.2 AA), current practice, and how to report a barrier.",
      bodyMarkdown: ACCESSIBILITY,
      publish: true,
    },
    {
      kind: "terms",
      title: "Terms of Service",
      summary:
        "The agreement that governs your use of All Elite Cloud.",
      bodyMarkdown: TERMS,
      publish: true,
    },
    {
      kind: "privacy",
      title: "Privacy Policy",
      summary:
        "What information we collect, why, who we share it with, and your choices.",
      bodyMarkdown: PRIVACY,
      publish: true,
    },
    {
      kind: "subscriptions",
      title: "Subscription, Cancellation, and Refund Policy",
      summary:
        "How paid plans, renewals, cancellation, failed payments, and refunds work.",
      bodyMarkdown: SUBSCRIPTIONS,
      publish: true,
    },
    {
      kind: "subprocessors",
      title: "Subprocessor List",
      summary:
        "The third-party providers that may process data on our behalf.",
      bodyMarkdown: SUBPROCESSORS,
      publish: true,
    },
  ];
}
