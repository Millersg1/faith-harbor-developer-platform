import type { LegalSeed } from "../PlatformLegalService";

/**
 * Seed content for All Elite Cloud's platform legal documents.
 *
 * Every published document here is written ONLY from behavior verified in the
 * codebase (see the inspection notes in the PR). Documents that require a
 * business or legal decision the code cannot supply — legal entity name,
 * governing law/venue, retention periods, refund window, minimum age, named
 * hosting/database/email providers — are seeded as DRAFT and carry explicit
 * "OWNER DECISION REQUIRED" notes in the draft body. Drafts are never served
 * on the public routes, so no placeholder text is ever shown publicly.
 *
 * The contact address legal@allelitecloud.com is owner-confirmed.
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
// DRAFT — require owner/attorney decisions before publication. The notes below
// are visible only in the admin editor (drafts are never served publicly).
// ---------------------------------------------------------------------------

const TERMS = `## About these terms

These Terms of Service govern your use of All Elite Cloud. By creating an account or using the service, you agree to them.

> OWNER DECISION REQUIRED before publishing: (1) the legal entity that operates All Elite Cloud (company name and form); (2) governing law and venue; (3) whether disputes go to arbitration and whether a class-action waiver applies; (4) minimum age to form an account; (5) any limitation-of-liability cap and warranty-disclaimer wording your attorney approves. Do not publish until these are confirmed.

## Your account

You must provide accurate information and keep your credentials secure. You are responsible for activity under your account and for your team members' use.

## The service

All Elite Cloud provides a multi-tenant business platform, including workspace tools, AI-assisted features, and website generation and hosting. Features and plans may change over time.

## Subscriptions and payment

Paid plans are billed through Stripe. Billing, cancellation, and failed-payment handling are described in the [Subscription, Cancellation, and Refund Policy](/legal/subscriptions).

## Your content

You retain ownership of the content you upload, generate, and publish. You grant us the limited license needed to host, process, and display that content to operate the service for you (for example, storing your files, rendering your website, and sending content you direct us to send).

## AI-assisted features

AI features are subject to the [AI Use and Human Review Policy](/legal/ai-policy). You are responsible for reviewing AI-assisted output before relying on or publishing it.

## Acceptable use

Your use must comply with the [Acceptable Use Policy](/legal/acceptable-use).

## Custom domains and hosting

You are responsible for domains you connect and for the content you publish. We provision TLS certificates automatically after a domain verifies; we do not guarantee a specific uptime percentage.

## Suspension and termination

We may suspend or terminate access for violations of these terms or the Acceptable Use Policy, or as needed to protect the service or comply with law. You may stop using the service at any time.

## Data export and deletion

You may request export or deletion of your data as described in our [Privacy Policy](/legal/privacy). Some records may be retained where required for legal, tax, security, or fraud-prevention reasons.

## Disclaimers and liability

> OWNER DECISION REQUIRED: warranty disclaimer and limitation-of-liability language to be confirmed by your attorney before publication.

## Changes

We may update these terms. Material changes will be posted here with a new effective date, and where appropriate we will ask you to re-accept.

## Contact

[${CONTACT}](mailto:${CONTACT}).`;

const PRIVACY = `## Introduction

This Privacy Policy explains what information All Elite Cloud collects, why, who we share it with, and the choices you have.

> OWNER DECISION REQUIRED before publishing: (1) the legal entity and its role (controller/processor) and contact/mailing address if one is provided; (2) data-retention periods you commit to (the platform does not currently enforce automated retention/deletion windows, and files are soft-deleted rather than purged — do not state a specific retention period until it is real); (3) the privacy frameworks you intend to reference; (4) whether any "we do not sell" statement is confirmed under applicable definitions. Do not publish until these are confirmed.

## Information we collect

- **Account information** you provide: organization name, your name, and email address.
- **Content** you upload, generate, and publish, including files, CRM records, projects, invoices, and website content.
- **Authentication and security data**, including session cookies (see the [Cookie Policy](/legal/cookies)) and limited request information used to rate-limit and secure the service.
- **Billing information** is handled by Stripe. We store Stripe identifiers (customer and subscription IDs) and plan/status; we do **not** receive or store your full card number.

## How we use information

To provide and secure the service, authenticate you, process payments through Stripe, send transactional and (where you configure them) marketing messages, provide AI-assisted features, and improve reliability.

## Who we share information with

We use the third-party processors listed in our [Subprocessor List](/legal/subprocessors) — including Stripe for payments, our AI providers for AI features, our email/SMTP provider for outbound email, and our hosting/database provider. We do not sell your content.

## AI features

When you use AI features, your task content is sent to an AI provider. See the [AI Use and Human Review Policy](/legal/ai-policy).

## Data retention and deletion

> OWNER DECISION REQUIRED: state real retention behavior only. Today, deleted files are soft-deleted (recoverable) and there is no automated purge job; describe this accurately once the owner decides on retention.

## Your choices and rights

You may request access, correction, or deletion of your personal information, or raise a privacy question, through our privacy-request channel or by contacting [${CONTACT}](mailto:${CONTACT}). We may need to verify your identity first. We will not delete records we must keep for legal, tax, security, or fraud-prevention reasons.

## Children

> OWNER DECISION REQUIRED: state the minimum age and whether the service is directed to children, consistent with the Terms of Service.

## Changes

We may update this policy and will post changes here with a new effective date.

## Contact

[${CONTACT}](mailto:${CONTACT}).`;

const SUBSCRIPTIONS = `## Plans and billing

Paid plans are billed through **Stripe**. When you choose a paid plan, checkout and card entry happen on Stripe's hosted pages. We store only Stripe identifiers and your plan and status — we never receive or store your full card number.

## Renewals

Subscriptions renew automatically each billing period through Stripe until cancelled. You can manage your subscription and payment method through the billing portal in your workspace.

## Cancellation

When a subscription is cancelled, your workspace reverts to the free plan; **your data is not deleted** as a result of cancellation. Plan limits for the free plan then apply.

## Failed payments

If a payment fails, your subscription is marked past-due and your access is retained while Stripe retries the charge. If the subscription is ultimately cancelled by Stripe after retries are exhausted, the cancellation behavior above applies. The retry window is governed by our payment processor's retry schedule.

> OWNER DECISION REQUIRED before publishing: (1) your refund policy — the platform does not implement a refund window, so do not state one until you decide it; (2) governing law/venue consistent with the Terms of Service; (3) whether you offer any proration or trial terms beyond what Stripe applies. Do not publish until these are confirmed.

## Refunds

> OWNER DECISION REQUIRED: refund terms to be confirmed. Do not promise a refund window that is not real.

## Contact

Billing questions: [${CONTACT}](mailto:${CONTACT}).`;

const SUBPROCESSORS = `## About this list

To operate All Elite Cloud, we use a small number of third-party service providers ("subprocessors") that may process data on our behalf. This page lists the categories and providers our software actually integrates with.

## Subprocessors

- **Stripe** — payment processing, subscription billing, and the billing portal. Receives billing and payment information you enter on Stripe's hosted pages.
- **OpenAI and/or OpenRouter** — AI providers that power AI-assisted features. Receive the task content you submit to those features (see the [AI Use and Human Review Policy](/legal/ai-policy)). Where you configure your own provider key, that provider is engaged under your own account.
- **Email delivery** — our outbound email is sent through an SMTP email provider. Receives message recipients, subjects, and bodies for transactional and configured marketing email.
- **Hosting and database** — our infrastructure and PostgreSQL database provider, which stores platform data.

> OWNER DECISION REQUIRED before publishing: confirm the specific named companies and locations for (a) the email/SMTP provider, (b) the hosting/infrastructure provider, and (c) the database host, and whether the AI subprocessor should name a default provider. The categories above are code-verified; the specific vendor names must be confirmed before this list is published.

## Changes

We may update this list as our providers change and will post updates here.

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
      publish: false,
    },
    {
      kind: "privacy",
      title: "Privacy Policy",
      summary:
        "What information we collect, why, who we share it with, and your choices.",
      bodyMarkdown: PRIVACY,
      publish: false,
    },
    {
      kind: "subscriptions",
      title: "Subscription, Cancellation, and Refund Policy",
      summary:
        "How paid plans, renewals, cancellation, failed payments, and refunds work.",
      bodyMarkdown: SUBSCRIPTIONS,
      publish: false,
    },
    {
      kind: "subprocessors",
      title: "Subprocessor List",
      summary:
        "The third-party providers that may process data on our behalf.",
      bodyMarkdown: SUBPROCESSORS,
      publish: false,
    },
  ];
}
