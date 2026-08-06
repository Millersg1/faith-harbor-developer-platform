/**
 * A no-code form a tenant builds and shares publicly to capture submissions
 * (and, optionally, leads). The public share URL resolves the tenant by the
 * form's globally-unique slug, so submissions land in the right organization
 * without the submitter having any account.
 */

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "textarea"
  | "checkbox"
  | "consent";

export const FORM_FIELD_TYPES: readonly FormFieldType[] =
  [
    "text",
    "email",
    "phone",
    "number",
    "date",
    "select",
    "textarea",
    "checkbox",
    "consent",
  ];

export interface FormField {
  /** Stable key used in submission data. */
  key: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  helpText?: string;
  /** Options for select fields. */
  options?: string[];
}

export type FormStatus =
  | "active"
  | "paused";

/**
 * Per-form security/abuse settings for public (external) embedding. Absent =
 * secure defaults: NO cross-origin embedding (deny-by-default), no honeypot,
 * no timing gate. A tenant opts into external embedding explicitly.
 */
export interface FormSettings {
  /**
   * Exact origins (scheme + host [+ port]) allowed to embed this form and read
   * its cross-origin responses, e.g. "https://institute.example". Empty/absent
   * means no cross-origin origin is allowed (same-origin only).
   */
  allowedOrigins?: string[];
  /**
   * EXPLICIT opt-in to `Access-Control-Allow-Origin: *` (any origin may embed).
   * Must be a deliberate owner/admin choice — never the default. Carries a
   * clear warning in the UI. Even when true, no credentials are ever allowed.
   */
  allowAnyOrigin?: boolean;
  /**
   * Honeypot field key. If a submission carries a non-empty value for this key
   * (a bot filling a hidden field), it is silently accepted but dropped.
   */
  honeypotField?: string;
  /**
   * Minimum seconds between the form being served and submitted. Enforced only
   * when the submission carries a valid server-issued form token (the hosted
   * page and cooperating embeds include it); best-effort otherwise.
   */
  minSubmitSeconds?: number;
}

export interface FormRecord {
  id: string;
  organizationId: string;
  name: string;
  /** Globally-unique public slug (the share URL). */
  slug: string;
  fields: FormField[];
  confirmationMessage: string;
  /** When set, submissions email a notification here. */
  notifyEmail?: string;
  /** Create a lead from a submission (when it carries a name/email). */
  createLead: boolean;
  /** Per-form security/abuse settings (see {@link FormSettings}). */
  settings: FormSettings;
  status: FormStatus;
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus =
  | "new"
  | "read"
  | "archived";

/**
 * Attribution + consent evidence for a public submission. Data-minimized:
 * - NO user-agent (not in the platform's disclosed data inventory; not
 *   collected — see docs/20_PUBLIC_LEAD_FORMS.md and the V1 Privacy Policy).
 * - IP is stored ONLY as a keyed hash (`ipHash`) for abuse/consent evidence;
 *   the raw IP is used transiently for rate limiting and never persisted here.
 * - `referrer`/`landingUrl` are reduced to origin+path (no query string,
 *   fragment, or credentials).
 * landingUrl + utm* are supplied by the embedding page. All optional.
 */
export interface FormAttribution {
  /** Keyed hash of the derived client IP (never the raw IP). */
  ipHash?: string;
  referrer?: string;
  landingUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  /** The lead-magnet the submission requested, if any. */
  leadMagnetId?: string;
  /** Consent evidence captured at submission time. */
  consent?: {
    granted: boolean;
    wording?: string;
    version?: string;
    source?: string;
    at?: string;
  };
  submittedAt?: string;
}

export interface FormSubmissionRecord {
  id: string;
  organizationId: string;
  formId: string;
  data: Record<string, unknown>;
  attribution?: FormAttribution;
  status: SubmissionStatus;
  createdAt: string;
}

export interface CreateFormRequest {
  name: string;
  fields?: FormField[];
  confirmationMessage?: string;
  notifyEmail?: string;
  createLead?: boolean;
  settings?: FormSettings;
}
