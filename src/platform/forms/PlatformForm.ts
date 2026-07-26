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
  status: FormStatus;
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus =
  | "new"
  | "read"
  | "archived";

export interface FormSubmissionRecord {
  id: string;
  organizationId: string;
  formId: string;
  data: Record<string, unknown>;
  status: SubmissionStatus;
  createdAt: string;
}

export interface CreateFormRequest {
  name: string;
  fields?: FormField[];
  confirmationMessage?: string;
  notifyEmail?: string;
  createLead?: boolean;
}
