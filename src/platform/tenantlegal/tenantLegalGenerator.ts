import {
  TENANT_LEGAL_META,
  type TenantLegalKind,
} from "./TenantLegalDocument";
import {
  missingMaterialFields,
  QUESTIONNAIRE_FIELDS,
  type QuestionnaireAnswers,
} from "./TenantQuestionnaire";

/**
 * Generates a customizable starting-template draft for a tenant legal document
 * from the tenant's questionnaire answers.
 *
 * Guarantees:
 *  - Nothing is invented. Only answered facts appear. Optional unanswered
 *    fields are omitted; MATERIAL unanswered fields are replaced with a
 *    `TODO:` placeholder, which the publication guard rejects — so a document
 *    with a missing material fact cannot be published until it is supplied.
 *  - Output is Markdown, rendered later by the shared escape-first safe
 *    renderer (no raw HTML, no scripts).
 *
 * These are templates, not legal advice and not attorney-approved — the
 * workspace surfaces that notice to the tenant.
 */

export interface GeneratedDocument {
  title: string;
  bodyMarkdown: string;
}

const LABEL = new Map(
  QUESTIONNAIRE_FIELDS.map((f) => [f.key, f.label]),
);

function todo(key: string): string {
  return `**TODO: provide ${LABEL.get(key) ?? key}**`;
}

/** Answered value, or a publication-blocking TODO placeholder. */
function need(
  answers: QuestionnaireAnswers,
  key: string,
): string {
  return answers[key] || todo(key);
}

/** Answered value, or empty string (caller decides whether to include). */
function opt(
  answers: QuestionnaireAnswers,
  key: string,
): string {
  return answers[key] || "";
}

function businessName(a: QuestionnaireAnswers): string {
  return a.publicName || a.legalName || todo("legalName");
}

export function generateTenantDocument(
  kind: TenantLegalKind,
  answers: QuestionnaireAnswers,
): GeneratedDocument {
  const title = TENANT_LEGAL_META[kind].title;
  const name = businessName(answers);
  const legal = need(answers, "legalName");
  const contact =
    opt(answers, "privacyContact") ||
    opt(answers, "contactEmail") ||
    todo("privacyContact");

  let body = "";
  switch (kind) {
    case "privacy":
      body = `This Privacy Policy explains how ${legal} ("we," "us") collects, uses, and shares information for ${name}${answers.website ? ` (${answers.website})` : ""}.

## Information we collect

${need(answers, "infoCollected")}

## How we use information

${need(answers, "infoUse")}

## Cookies and tracking

${opt(answers, "cookiesUsed") || "See our Cookie Policy for details on cookies and tracking technologies we use."}

## Email and marketing

${opt(answers, "emailMarketing") || "We send messages related to your use of our services. Where we send marketing messages, you can opt out at any time."}

## Service providers

${opt(answers, "providers") || "We use third-party service providers to operate our business; they process information only to provide their services to us."}

## Data retention

${opt(answers, "retention") || "We keep information for as long as needed for the purposes described above and as required by law."}

## Children

${opt(answers, "children") || "Our services are not directed to children."}

## Your choices

To make a privacy request, contact ${contact}.

## Changes

We may update this policy and will post changes here with a new effective date.`;
      break;

    case "terms":
      body = `These Terms and Conditions govern your use of ${name}${answers.website ? ` at ${answers.website}` : ""}, operated by ${legal}.

## Our services

${need(answers, "services")}

## Your responsibilities

You agree to use our services lawfully and to provide accurate information.

${
  answers.paymentModel
    ? `## Payments\n\n${answers.paymentModel}${answers.cancellation ? `\n\n${answers.cancellation}` : ""}${answers.refund ? `\n\n${answers.refund}` : ""}\n`
    : ""
}
## Governing law

These terms are governed by the laws of ${need(answers, "jurisdiction")}.

## Changes

We may update these terms and will post changes here with a new effective date.

## Contact

Questions: ${contact}.`;
      break;

    case "cookies":
      body = `This Cookie Policy describes how ${name} uses cookies and similar technologies.

## Cookies we use

${need(answers, "cookiesUsed")}

## Managing cookies

You can control cookies through your browser settings. Blocking some cookies may affect how the site works.

## Contact

Questions: ${contact}.`;
      break;

    case "refund":
      body = `This policy describes cancellation and refunds for ${name}, operated by ${legal}.

## Payment model

${need(answers, "paymentModel")}

## Cancellation

${need(answers, "cancellation")}

## Refunds

${need(answers, "refund")}

## Contact

Questions: ${contact}.`;
      break;

    case "acceptable-use":
      body = `This Acceptable Use Policy applies to ${name}, operated by ${legal}.

## Prohibited uses

You may not use our services to break the law, infringe others' rights, distribute malware, attempt unauthorized access, send unlawful or unsolicited bulk messages, or disrupt the service.

## Enforcement

We may suspend or terminate access for violations of this policy.

## Contact

Report abuse to ${contact}.`;
      break;

    case "accessibility":
      body = `${legal} wants ${name} to be usable by as many people as possible.

## Our commitment

We aim to follow recognized accessibility guidance and to improve over time. This statement is not a certification.

## Feedback

If you encounter an accessibility barrier, contact ${need(answers, "contactEmail")} and describe the problem and the page.`;
      break;

    case "ai-disclosure":
      body = `This disclosure explains how ${name}, operated by ${legal}, uses AI-assisted features.

## AI features

${need(answers, "aiFeatures")}

## Human review

AI output can be wrong or incomplete. We review AI-assisted output before relying on or publishing it where appropriate.

## Contact

Questions: ${contact}.`;
      break;

    case "subprocessors":
      body = `This page lists the service providers ${legal} uses to operate ${name}.

## Service providers

${need(answers, "providers")}

${answers.aiFeatures ? `## AI providers\n\n${answers.aiFeatures}\n\n` : ""}## Updates

We update this list as our providers change.

## Contact

Questions: ${contact}.`;
      break;
  }

  return { title, bodyMarkdown: body.trim() };
}

/** True when generating this kind now would leave a material fact missing. */
export function generationHasMissingFacts(
  kind: TenantLegalKind,
  answers: QuestionnaireAnswers,
): string[] {
  return missingMaterialFields(kind, answers);
}
