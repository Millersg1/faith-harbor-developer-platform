import { randomBytes, randomUUID } from "node:crypto";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { ActivityService } from "../events/ActivityService";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import type { PlatformLeadService } from "../crm/PlatformLeadService";
import {
  FORM_FIELD_TYPES,
  type CreateFormRequest,
  type FormField,
  type FormRecord,
  type FormStatus,
  type FormSubmissionRecord,
} from "./PlatformForm";
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
            status: "new",
            createdAt: nowIso,
          },
        );

        // Optionally create a lead from the submission.
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
              await this.leads.create(
                lead,
              );
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

        void this.activity?.record({
          actorType: "system",
          type: "form.submitted",
          subjectType: "form",
          subjectId: form.id,
          title: `Form submitted: ${form.name}`,
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
  source: string;
  notes: string;
} | null {
  let email: string | undefined;
  let name: string | undefined;
  let company: string | undefined;

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
