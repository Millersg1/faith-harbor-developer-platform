import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  TenantLegalDocumentRecord,
  TenantLegalKind,
  TenantLegalStatus,
} from "./TenantLegalDocument";

interface Row {
  id: string;
  organization_id: string;
  kind: string;
  version: number;
  title: string;
  body_markdown: string;
  status: string;
  human_reviewed: boolean;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string | null;
}

/**
 * Stores a tenant's own legal documents, always scoped to the acting
 * organization. The organization id is stamped from the tenant context
 * (fail-closed) and every query filters on it explicitly, so one tenant can
 * never read or change another tenant's documents. In memory for tests;
 * Postgres when a query surface is supplied.
 */
export class TenantLegalDocumentRepository extends TenantScopedRepository {
  private readonly memory = new Map<
    string,
    TenantLegalDocumentRecord
  >();

  async create(
    record: Omit<TenantLegalDocumentRecord, "organizationId">,
  ): Promise<TenantLegalDocumentRecord> {
    const organizationId = this.tenantId();
    const full: TenantLegalDocumentRecord = {
      ...record,
      organizationId,
    };
    if (this.db) {
      await this.db.query(
        `INSERT INTO tenant_legal_documents
           (id, organization_id, kind, version, title, body_markdown, status,
            human_reviewed, effective_date, created_at, updated_at,
            published_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          full.id,
          full.organizationId,
          full.kind,
          full.version,
          full.title,
          full.bodyMarkdown,
          full.status,
          full.humanReviewed,
          full.effectiveDate,
          full.createdAt,
          full.updatedAt,
          full.publishedAt,
          full.createdBy,
        ],
      );
      return full;
    }
    this.memory.set(full.id, full);
    return full;
  }

  async get(
    id: string,
  ): Promise<TenantLegalDocumentRecord | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM tenant_legal_documents WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );
      const row = asRow(result.rows[0]);
      return row ? mapRow(row) : undefined;
    }
    const rec = this.memory.get(id);
    return rec && rec.organizationId === organizationId
      ? rec
      : undefined;
  }

  async getPublished(
    kind: TenantLegalKind,
  ): Promise<TenantLegalDocumentRecord | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM tenant_legal_documents
          WHERE organization_id = $1 AND kind = $2 AND status = 'published'
          ORDER BY version DESC LIMIT 1`,
        [organizationId, kind],
      );
      const row = asRow(result.rows[0]);
      return row ? mapRow(row) : undefined;
    }
    return this.mem(organizationId)
      .filter(
        (r) => r.kind === kind && r.status === "published",
      )
      .sort((a, b) => b.version - a.version)[0];
  }

  async listVersions(
    kind: TenantLegalKind,
  ): Promise<TenantLegalDocumentRecord[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM tenant_legal_documents
          WHERE organization_id = $1 AND kind = $2
          ORDER BY version DESC`,
        [organizationId, kind],
      );
      return mapRows(result.rows);
    }
    return this.mem(organizationId)
      .filter((r) => r.kind === kind)
      .sort((a, b) => b.version - a.version);
  }

  async getLatest(
    kind: TenantLegalKind,
  ): Promise<TenantLegalDocumentRecord | undefined> {
    return (await this.listVersions(kind))[0];
  }

  async listAll(): Promise<TenantLegalDocumentRecord[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM tenant_legal_documents
          WHERE organization_id = $1
          ORDER BY kind, version DESC`,
        [organizationId],
      );
      return mapRows(result.rows);
    }
    return this.mem(organizationId);
  }

  async update(
    record: TenantLegalDocumentRecord,
  ): Promise<TenantLegalDocumentRecord> {
    const organizationId = this.tenantId();
    if (this.db) {
      await this.db.query(
        `UPDATE tenant_legal_documents
            SET title=$3, body_markdown=$4, status=$5, human_reviewed=$6,
                effective_date=$7, updated_at=$8, published_at=$9
          WHERE id=$1 AND organization_id=$2`,
        [
          record.id,
          organizationId,
          record.title,
          record.bodyMarkdown,
          record.status,
          record.humanReviewed,
          record.effectiveDate,
          record.updatedAt,
          record.publishedAt,
        ],
      );
      return record;
    }
    const existing = this.memory.get(record.id);
    if (
      existing &&
      existing.organizationId === organizationId
    ) {
      this.memory.set(record.id, record);
    }
    return record;
  }

  private mem(
    organizationId: string,
  ): TenantLegalDocumentRecord[] {
    return Array.from(this.memory.values()).filter(
      (r) => r.organizationId === organizationId,
    );
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): Row | undefined {
  return row as Row | undefined;
}

function mapRows(
  rows: Record<string, unknown>[],
): TenantLegalDocumentRecord[] {
  return rows
    .map(asRow)
    .filter((r): r is Row => r !== undefined)
    .map(mapRow);
}

function mapRow(row: Row): TenantLegalDocumentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    kind: row.kind as TenantLegalKind,
    version: Number(row.version),
    title: row.title,
    bodyMarkdown: row.body_markdown,
    status: row.status as TenantLegalStatus,
    humanReviewed: Boolean(row.human_reviewed),
    effectiveDate: row.effective_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
  };
}
