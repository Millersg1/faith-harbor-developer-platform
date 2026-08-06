import { randomBytes, randomUUID } from "node:crypto";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { ActivityService } from "../events/ActivityService";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import type { PlatformLeadService } from "../crm/PlatformLeadService";
import {
  FORM_FIELD_TYPES,
  type CreateFormRequest,
  type FormAttribution,
  type FormField,
  type FormRecord,
  type FormSettings,
  type FormStatus,
  type FormSubmissionRecord,
} from "./PlatformForm";
import type { PlatformLeadRecord } from "../crm/PlatformLead";
import { PlatformFormRepository } from "./PlatformFormRepository";

export class FormValidationError extends Error {}
export class FormNotFoundError extends Error {}

export interface FormServiceOptions {
  leads?: PlatformLeadService;
  email?: PlatformEmailService;
  activity?: ActivityService;
  now?: () => number;
}

/**
 * Builds and runs a tenant's forms.
 *
 * Authenticated methods (create/list/update/submissions) run in the caller's
 * tenant scope. {@link submitPublic} is the ONLY public entry: it resolves
 * the form by its global slug, then does all work — submission, lead, notify,
 * activity — INSIDE that form's tenant scope, so nothing crosses tenants.
 */
export class PlatformFormService {
  private readonly leads?: PlatformLeadService;

  private readonly email?: PlatformEmailService;

  private readonly activity?: ActivityService;

  private readonly now: () => number;

  constructor(
    private readonly repository =
      new PlatformFormRepository(),
    options: FormServiceOptions = {},
  ) {
    this.leads = options.leads;
    this.email = options.email;
    this.activity = options.activity;
    this.now =
      options.now ??
      (() => Date.now());
  }

  async create(
    request: CreateFormRequest,
  ): Promise<FormRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new FormValidationError(
        "A form needs a name.",
      );
    }

    const now = new Date(
      this.now(),
    ).toISOString();

    return this.repository.create({
      id: randomUUID(),
      name,
      slug: makeSlug(name),
      fields: sanitizeFields(
        request.fields,
      ),
      confirmationMessage:
        request.confirmationMessage?.trim() ||
        "Thanks — we got your submission.",
      notifyEmail:
        request.notifyEmail?.trim() ||
        undefined,
      createLead:
        request.createLead ?? true,
      settings: sanitizeSettings(request.settings),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  async list(): Promise<
    readonly FormRecord[]
  > {
    return this.repository.list();
  }

  async get(
    id: string,
  ): Promise<FormRecord> {
    const form =
      await this.repository.get(id);

    if (!form) {
      throw new FormNotFoundError(
        "Form not found.",
      );
    }

    return form;
  }

  async update(
    id: string,
    changes: Partial<
      CreateFormRequest
    > & { status?: FormStatus },
  ): Promise<FormRecord> {
    const form = await this.get(id);

    const updated: FormRecord = {
      ...form,
      name:
        changes.name?.trim() ||
        form.name,
      fields: changes.fields
        ? sanitizeFields(
            changes.fields,
          )
        : form.fields,
      confirmationMessage:
        changes.confirmationMessage?.trim() ||
        form.confirmationMessage,
      notifyEmail:
        changes.notifyEmail !==
        undefined
          ? changes.notifyEmail.trim() ||
            undefined
          : form.notifyEmail,
      createLead:
        changes.createLead ??
        form.createLead,
      settings:
        changes.settings !== undefined
          ? sanitizeSettings(changes.settings)
          : form.settings,
      status:
        changes.status === "paused" ||
        changes.status === "active"
          ? changes.status
          : form.status,
      updatedAt: new Date(
        this.now(),
      ).toISOString(),
    };

    return this.repository.update(
      updated,
    );
  }

  async listSubmissions(
    formId: string,
  ): Promise<
    readonly FormSubmissionRecord[]
  > {
    await this.get(formId);

    return this.repository.listSubmissions(
      formId,
    );
  }

  /**
   * The public form (name + fields + confirmation) for rendering a share
   * page. Resolves globally by slug; returns undefined if unknown or paused.
   */
  async getPublicBySlug(
    slug: string,
  ): Promise<FormRecord | undefined> {
    const form =
      await this.repository.findBySlugGlobal(
        slug,
      );

    return form &&
      form.status === "active"
      ? form
      : undefined;
  }

  /**
   * Accepts a public submission for the form identified by `slug`. Runs
   * entirely inside the form's tenant scope. Returns the confirmation
   * message. Throws FormNotFoundError for an unknown/paused form and
   * FormValidationError for missing required fields.
   */
  async submitPublic(
    slug: string,
    data: Record<string, unknown>,
    attribution?: FormAttribution,
  ): Promise<{
    confirmationMessage: string;
  }> {
    const form =
      await this.repository.findBySlugGlobal(
        slug,
      );

    if (
      !form ||
      form.status !== "active"
    ) {
      throw new FormNotFoundError(
        "This form is not available.",
      );
    }

    // Validate required fields against the form definition.
    for (const field of form.fields) {
      if (!field.required) continue;

      const value = data[field.key];

      if (
        field.type === "consent"
      ) {
        if (value !== true) {
          throw new FormValidationError(
            `${field.label} is required.`,
          );
        }
      } else if (
        value == null ||
        String(value).trim() === ""
      ) {
        throw new FormValidationError(
          `${field.label} is required.`,
        );
      }
    }

    // Keep only known fields — never store arbitrary submitted keys.
    const clean: Record<
      string,
      unknown
    > = {};
    for (const field of form.fields) {
      if (field.key in data) {
        clean[field.key] =
          data[field.key];
      }
    }

    return runWithTenant(
      {
        organizationId:
          form.organizationId,
      },
      async () => {
        const nowIso = new Date(
          this.now(),
        ).toISOString();

        await this.repository.createSubmission(
          {
            id: randomUUID(),
            organizationId:
              form.organizationId,
            formId: form.id,
            data: clean,
            ...(attribution
              ? { attribution: { ...attribution, submittedAt: nowIso } }
              : {}),
            status: "new",
            createdAt: nowIso,
          },
        );

        // Optionally create OR safely merge a lead from the submission.
        if (
          form.createLead &&
          this.leads
        ) {
          const lead =
            extractLead(
              form,
              clean,
            );
          if (lead) {
            try {
              // Tenant-scoped merge: if a lead with this email already exists,
              // fill only EMPTY fields — never overwrite stronger CRM data with
              // blanks or lower-confidence public data. findByEmail is
              // tenant-scoped, so leads are NEVER merged across tenants.
              const existing = lead.email
                ? await this.leads.findByEmail(lead.email)
                : undefined;
              if (existing) {
                await this.leads.update(existing.id, mergeFill(existing, lead));
              } else {
                await this.leads.create(lead);
              }
              // NOTE: a public form submission deliberately does NOT start any
              // marketing autoresponder here. Marketing enrollment is gated on
              // explicit affirmative consent AND on the platform having a
              // consent/unsubscribe/suppression core — fail-closed for now.
              // See docs/20_PUBLIC_LEAD_FORMS.md. Creating/merging the CRM lead
              // is a separate outcome from marketing and is safe on its own.
            } catch {
              // A lead hiccup must not fail the submission.
            }
          }
        }

        // Best-effort notification to the form owner.
        if (
          form.notifyEmail &&
          this.email
        ) {
          await this.email.sendQuietly(
            {
              to: form.notifyEmail,
              subject: `New submission: ${form.name}`,
              body: summarize(
                form,
                clean,
              ),
            },
          );
        }

        const contact = extractLead(
          form,
          clean,
        );
        void this.activity?.record({
          actorType: "system",
          type: "form.submitted",
          subjectType: "form",
          subjectId: form.id,
          title: `Form submitted: ${form.name}`,
          metadata: {
            email: contact?.email,
            name: contact?.name,
          },
        });

        return {
          confirmationMessage:
            form.confirmationMessage,
        };
      },
    );
  }
}

/**
 * Builds a lead from a submission when it carries a usable name or email.
 */
function extractLead(
  form: FormRecord,
  data: Record<string, unknown>,
): {
  name: string;
  email?: string;
  company?: string;
  phone?: string;
  source: string;
  notes: string;
} | null {
  let email: string | undefined;
  let name: string | undefined;
  let company: string | undefined;
  let phone: string | undefined;

  for (const field of form.fields) {
    const value = data[field.key];
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;

    if (
      field.type === "email" &&
      !email
    ) {
      email = text;
    } else if (
      (field.type === "phone" ||
        /phone|mobile|tel/i.test(field.key + " " + field.label)) &&
      !phone
    ) {
      phone = text;
    } else if (
      /company|organization|business/i.test(
        field.key + " " + field.label,
      ) &&
      !company
    ) {
      company = text;
    } else if (
      /name/i.test(
        field.key + " " + field.label,
      ) &&
      !name
    ) {
      name = text;
    }
  }

  if (!name) {
    name = email ?? "Form submission";
  }

  if (!email && !name) {
    return null;
  }

  return {
    name,
    email,
    company,
    phone,
    source: `Form: ${form.name}`,
    notes: summarize(form, data),
  };
}

/**
 * A readable text summary of a submission, for lead notes / notification.
 */
function summarize(
  form: FormRecord,
  data: Record<string, unknown>,
): string {
  const lines = form.fields.map(
    (field) =>
      `${field.label}: ${formatValue(data[field.key])}`,
  );

  return (
    `New submission for "${form.name}":\n\n` +
    lines.join("\n")
  );
}

function formatValue(
  value: unknown,
): string {
  if (value == null) return "(blank)";
  if (value === true) return "Yes";
  if (value === false) return "No";

  return String(value);
}

/**
 * Validates and trims field definitions. Unknown field types and blank
 * keys/labels are dropped.
 */
/**
 * Deterministic merge: return ONLY the fields to set on an existing lead, and
 * only where the existing value is empty (or a placeholder name). Never
 * overwrites stronger CRM data with blanks or lower-confidence public data.
 */
function mergeFill(
  existing: PlatformLeadRecord,
  incoming: {
    name: string;
    company?: string;
    phone?: string;
    source?: string;
    notes?: string;
  },
): {
  name?: string;
  company?: string;
  phone?: string;
  source?: string;
  notes?: string;
} {
  const upd: {
    name?: string;
    company?: string;
    phone?: string;
    source?: string;
    notes?: string;
  } = {};
  const empty = (v: string | undefined): boolean => !v || !v.trim();
  if (
    (empty(existing.name) || existing.name === "Form submission") &&
    incoming.name
  ) {
    upd.name = incoming.name;
  }
  if (empty(existing.company) && incoming.company) upd.company = incoming.company;
  if (empty(existing.phone) && incoming.phone) upd.phone = incoming.phone;
  if (empty(existing.source) && incoming.source) upd.source = incoming.source;
  if (empty(existing.notes) && incoming.notes) upd.notes = incoming.notes;
  return upd;
}

/** Normalize an origin to `scheme://host[:port]`, lower-cased, no trailing slash. */
export function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether a browser `Origin` may embed this form. Deny-by-default: only exact
 * configured origins match, unless the tenant EXPLICITLY set allowAnyOrigin.
 * The slug is public and is never treated as authorization here.
 */
export function isOriginAllowed(
  settings: FormSettings | undefined,
  origin: string | undefined,
): boolean {
  if (settings?.allowAnyOrigin) return true;
  const o = origin ? normalizeOrigin(origin) : null;
  if (!o) return false;
  const allowed = (settings?.allowedOrigins ?? [])
    .map((x) => normalizeOrigin(x))
    .filter((x): x is string => Boolean(x));
  return allowed.includes(o);
}

function sanitizeSettings(
  s: FormSettings | undefined,
): FormSettings {
  const out: FormSettings = {};
  if (s && Array.isArray(s.allowedOrigins)) {
    const origins = s.allowedOrigins
      .map((o) => normalizeOrigin(o))
      .filter((o): o is string => Boolean(o));
    if (origins.length) out.allowedOrigins = [...new Set(origins)].slice(0, 50);
  }
  if (s?.allowAnyOrigin === true) out.allowAnyOrigin = true;
  if (s && typeof s.honeypotField === "string" && s.honeypotField.trim()) {
    out.honeypotField = s.honeypotField
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 40);
  }
  if (
    s &&
    typeof s.minSubmitSeconds === "number" &&
    Number.isFinite(s.minSubmitSeconds) &&
    s.minSubmitSeconds > 0
  ) {
    out.minSubmitSeconds = Math.min(Math.floor(s.minSubmitSeconds), 3600);
  }
  return out;
}

function sanitizeFields(
  fields: FormField[] | undefined,
): FormField[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  const seen = new Set<string>();
  const out: FormField[] = [];

  for (const field of fields) {
    const key = String(
      field?.key ?? "",
    )
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 40);
    const label = String(
      field?.label ?? "",
    )
      .trim()
      .slice(0, 120);

    if (
      !key ||
      !label ||
      seen.has(key) ||
      !FORM_FIELD_TYPES.includes(
        field.type,
      )
    ) {
      continue;
    }

    seen.add(key);

    const clean: FormField = {
      key,
      label,
      type: field.type,
      required: Boolean(
        field.required,
      ),
    };

    if (field.helpText) {
      clean.helpText = String(
        field.helpText,
      ).slice(0, 200);
    }

    if (
      field.type === "select" &&
      Array.isArray(field.options)
    ) {
      clean.options = field.options
        .map((o) =>
          String(o).slice(0, 80),
        )
        .filter(Boolean)
        .slice(0, 30);
    }

    out.push(clean);
  }

  return out.slice(0, 40);
}

/**
 * A readable, globally-unique slug: a slugified name plus random entropy.
 */
function makeSlug(
  name: string,
): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(4)
    .toString("hex");

  return base
    ? `${base}-${suffix}`
    : suffix;
}
