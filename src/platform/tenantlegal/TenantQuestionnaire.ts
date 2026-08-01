import type { TenantLegalKind } from "./TenantLegalDocument";

/**
 * The tenant legal questionnaire. Answers are the ONLY source of factual
 * content for generated documents — nothing is invented. Missing material
 * fields are surfaced (and, when a document is generated, marked with a
 * publication-blocking placeholder) so a tenant cannot publish a document that
 * still has an unanswered material fact.
 */

export type QuestionnaireAnswers = Record<string, string>;

export interface QuestionnaireField {
  key: string;
  label: string;
  help: string;
  /** Grouping for the workspace UI. */
  category: string;
  /** Render as a multi-line textarea. */
  multiline?: boolean;
}

export const QUESTIONNAIRE_FIELDS: QuestionnaireField[] = [
  // Identity & contact
  { key: "legalName", label: "Legal / business name", help: "The legal name of the business that operates the website.", category: "Business" },
  { key: "publicName", label: "Public business name", help: "The name shown to customers (if different).", category: "Business" },
  { key: "jurisdiction", label: "Governing law / jurisdiction", help: "e.g. the state or country whose law governs your terms.", category: "Business" },
  { key: "location", label: "Business location", help: "City, state/region, country.", category: "Business" },
  { key: "mailingAddress", label: "Mailing address (optional)", help: "Only if you choose or are required to provide one.", category: "Business" },
  { key: "contactEmail", label: "Contact email", help: "General contact address for your site.", category: "Business" },
  { key: "website", label: "Website URL", help: "Your primary website address.", category: "Business" },
  { key: "customDomains", label: "Custom domains", help: "Any additional domains this policy covers.", category: "Business" },
  { key: "audience", label: "Intended audience / age restrictions", help: "Who the site is for; any minimum age.", category: "Business" },
  // Commerce
  { key: "services", label: "Services or products offered", help: "What you sell or provide.", category: "Commerce", multiline: true },
  { key: "paymentModel", label: "Payment / subscription model", help: "e.g. one-time purchases, subscriptions, both, or none.", category: "Commerce" },
  { key: "cancellation", label: "Cancellation practices", help: "How customers cancel and when it takes effect.", category: "Commerce", multiline: true },
  { key: "refund", label: "Refund practices", help: "Your actual refund policy. Do not overstate.", category: "Commerce", multiline: true },
  // Data
  { key: "infoCollected", label: "Information collected", help: "The categories of personal information you collect.", category: "Data", multiline: true },
  { key: "infoUse", label: "Why information is used", help: "The purposes for collecting it.", category: "Data", multiline: true },
  { key: "cookiesUsed", label: "Cookies & tracking actually used", help: "Only cookies/trackers your site really uses.", category: "Data", multiline: true },
  { key: "emailMarketing", label: "Email & marketing practices", help: "Transactional vs marketing email; consent/unsubscribe.", category: "Data", multiline: true },
  { key: "retention", label: "Data retention practices", help: "How long you keep information. State only what is true.", category: "Data", multiline: true },
  { key: "privacyContact", label: "Privacy-request contact method", help: "How people reach you for access/deletion requests.", category: "Data" },
  { key: "children", label: "Children / minors considerations", help: "Whether your service is directed to children.", category: "Data", multiline: true },
  // Vendors & AI
  { key: "providers", label: "Hosting & other service providers", help: "Third parties that process data for you.", category: "Vendors", multiline: true },
  { key: "aiFeatures", label: "AI providers & AI-assisted features", help: "Any AI features and providers you use, if any.", category: "Vendors", multiline: true },
];

const FIELD_KEYS = new Set(
  QUESTIONNAIRE_FIELDS.map((f) => f.key),
);

/** Keep only recognized keys; coerce to trimmed strings. Never stores junk. */
export function sanitizeAnswers(
  input: unknown,
): QuestionnaireAnswers {
  const out: QuestionnaireAnswers = {};
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (FIELD_KEYS.has(k) && typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed) {
          out[k] = trimmed;
        }
      }
    }
  }
  return out;
}

/**
 * Material fields per document kind: if any is unanswered, generation inserts a
 * publication-blocking placeholder, so the document cannot be published until
 * the tenant supplies the fact.
 */
export const MATERIAL_FIELDS: Record<
  TenantLegalKind,
  string[]
> = {
  privacy: [
    "legalName",
    "infoCollected",
    "infoUse",
    "privacyContact",
  ],
  terms: ["legalName", "jurisdiction", "services"],
  cookies: ["legalName", "cookiesUsed"],
  refund: ["legalName", "paymentModel", "refund", "cancellation"],
  "acceptable-use": ["legalName"],
  accessibility: ["legalName", "contactEmail"],
  "ai-disclosure": ["legalName", "aiFeatures"],
  subprocessors: ["legalName", "providers"],
};

export function missingMaterialFields(
  kind: TenantLegalKind,
  answers: QuestionnaireAnswers,
): string[] {
  return (MATERIAL_FIELDS[kind] ?? []).filter(
    (k) => !answers[k],
  );
}
