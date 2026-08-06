import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  FormField,
  FormRecord,
  FormSettings,
  FormStatus,
  FormSubmissionRecord,
  SubmissionStatus,
} from "./PlatformForm";

interface FormRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  fields: unknown;
  confirmation_message: string;
  notify_email: string | null;
  create_lead: boolean;
  settings: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  id: string;
  organization_id: string;
  form_id: string;
  data: unknown;
  status: string;
  created_at: string;
}

/**
 * Stores forms and their submissions. CRUD is tenant-scoped; the single
 * exception is {@link findBySlugGlobal}, which the PUBLIC submit path uses to
 * resolve which tenant a share URL belongs to before entering that tenant's
 * scope. It returns only what's needed to render/accept the form.
 */
export class PlatformFormRepository extends TenantScopedRepository {
  private readonly forms = new Map<
    string,
    FormRecord
  >();

  private readonly submissions: FormSubmissionRecord[] =
    [];

  async create(
    record: Omit<
      FormRecord,
      "organizationId"
    >,
  ): Promise<FormRecord> {
    const organizationId =
      this.tenantId();
    const full: FormRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO forms
           (id, organization_id, name, slug, fields, confirmation_message,
            notify_email, create_lead, settings, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          full.id,
          full.organizationId,
          full.name,
          full.slug,
          JSON.stringify(full.fields),
          full.confirmationMessage,
          full.notifyEmail ?? null,
          full.createLead,
          JSON.stringify(full.settings ?? {}),
          full.status,
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.forms.set(full.id, full);

    return full;
  }

  async get(
    id: string,
  ): Promise<FormRecord | undefined> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM forms WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | FormRow
        | undefined;

      return row
        ? mapForm(row)
        : undefined;
    }

    const record =
      this.forms.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(): Promise<FormRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM forms
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return (
        result.rows as unknown as FormRow[]
      ).map(mapForm);
    }

    return [
      ...this.forms.values(),
    ].filter(
      (f) =>
        f.organizationId ===
        organizationId,
    );
  }

  async update(
    record: FormRecord,
  ): Promise<FormRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE forms
            SET name = $3, fields = $4, confirmation_message = $5,
                notify_email = $6, create_lead = $7, settings = $8,
                status = $9, updated_at = $10
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.name,
          JSON.stringify(
            record.fields,
          ),
          record.confirmationMessage,
          record.notifyEmail ?? null,
          record.createLead,
          JSON.stringify(record.settings ?? {}),
          record.status,
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.forms.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.forms.set(
        record.id,
        record,
      );
    }

    return record;
  }

  /**
   * SYSTEM ONLY — resolves a form by its globally-unique public slug, with no
   * tenant filter, so the public submit/render path can discover which tenant
   * a share URL belongs to. The caller then enters that tenant's scope for
   * all further work.
   */
  async findBySlugGlobal(
    slug: string,
  ): Promise<FormRecord | undefined> {
    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM forms WHERE slug = $1 LIMIT 1",
          [slug],
        );
      const row = result
        .rows[0] as unknown as
        | FormRow
        | undefined;

      return row
        ? mapForm(row)
        : undefined;
    }

    for (const f of this.forms.values()) {
      if (f.slug === slug) return f;
    }

    return undefined;
  }

  // ---- Submissions ----

  async createSubmission(
    record: Omit<
      FormSubmissionRecord,
      "organizationId"
    > & {
      organizationId: string;
    },
  ): Promise<FormSubmissionRecord> {
    // organizationId is passed explicitly: the public submit path runs inside
    // the form's tenant scope, set by the service via runWithTenant.
    const full: FormSubmissionRecord =
      record;

    if (this.db) {
      await this.db.query(
        `INSERT INTO form_submissions
           (id, organization_id, form_id, data, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          full.id,
          full.organizationId,
          full.formId,
          JSON.stringify(full.data),
          full.status,
          full.createdAt,
        ],
      );

      return full;
    }

    this.submissions.push(full);

    return full;
  }

  async listSubmissions(
    formId: string,
  ): Promise<
    FormSubmissionRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM form_submissions
            WHERE organization_id = $1 AND form_id = $2
            ORDER BY created_at DESC
            LIMIT 500`,
          [organizationId, formId],
        );

      return (
        result.rows as unknown as SubmissionRow[]
      ).map(mapSubmission);
    }

    return this.submissions
      .filter(
        (s) =>
          s.organizationId ===
            organizationId &&
          s.formId === formId,
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      );
  }
}

function mapForm(
  row: FormRow,
): FormRecord {
  const record: FormRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    name: row.name,
    slug: row.slug,
    fields: parseFields(row.fields),
    confirmationMessage:
      row.confirmation_message,
    createLead: Boolean(
      row.create_lead,
    ),
    settings: parseSettings(row.settings),
    status: row.status as FormStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.notify_email)
    record.notifyEmail =
      row.notify_email;

  return record;
}

function parseSettings(value: unknown): FormSettings {
  let obj: unknown = value;
  if (typeof value === "string") {
    try {
      obj = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return obj && typeof obj === "object"
    ? (obj as FormSettings)
    : {};
}

function parseFields(
  value: unknown,
): FormField[] {
  if (Array.isArray(value))
    return value as FormField[];

  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);

      return Array.isArray(p)
        ? (p as FormField[])
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapSubmission(
  row: SubmissionRow,
): FormSubmissionRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    formId: row.form_id,
    data: parseData(row.data),
    status:
      row.status as SubmissionStatus,
    createdAt: row.created_at,
  };
}

function parseData(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object"
  )
    return value as Record<
      string,
      unknown
    >;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {};
}
