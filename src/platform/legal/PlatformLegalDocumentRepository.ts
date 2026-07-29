import type { PgQueryable } from "../../persistence/PgQueryable";
import type {
  LegalKind,
  LegalStatus,
  PlatformLegalDocumentRecord,
} from "./PlatformLegalDocument";

interface Row {
  id: string;
  kind: string;
  version: number;
  title: string;
  summary: string;
  body_markdown: string;
  status: string;
  effective_date: string | null;
  requires_reconsent: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string | null;
}

/**
 * Stores the platform's own legal documents. These are GLOBAL — there is no
 * organization scope — because they are All Elite Cloud's documents, managed
 * only by platform owners and served at the shared `/legal/*` URLs.
 *
 * The repository never deletes or rewrites a published version. Immutability
 * and version transitions are enforced in {@link PlatformLegalService}; the
 * repository exposes a narrow update used only for pre-publication drafts and
 * for status transitions that never touch the body of a published version.
 *
 * In memory without a database (tests); Postgres when a query surface is
 * supplied — mirroring the tenant repositories.
 */
export class PlatformLegalDocumentRepository {
  private readonly memory = new Map<
    string,
    PlatformLegalDocumentRecord
  >();

  constructor(private readonly db?: PgQueryable) {}

  async create(
    record: PlatformLegalDocumentRecord,
  ): Promise<PlatformLegalDocumentRecord> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO platform_legal_documents
           (id, kind, version, title, summary, body_markdown, status,
            effective_date, requires_reconsent, created_at, updated_at,
            published_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          record.id,
          record.kind,
          record.version,
          record.title,
          record.summary,
          record.bodyMarkdown,
          record.status,
          record.effectiveDate,
          record.requiresReconsent,
          record.createdAt,
          record.updatedAt,
          record.publishedAt,
          record.createdBy,
        ],
      );
      return record;
    }
    this.memory.set(record.id, record);
    return record;
  }

  async get(
    id: string,
  ): Promise<PlatformLegalDocumentRecord | undefined> {
    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM platform_legal_documents WHERE id = $1",
        [id],
      );
      const row = asRow(result.rows[0]);
      return row ? mapRow(row) : undefined;
    }
    return this.memory.get(id);
  }

  /** The current published version of a kind, if any. */
  async getPublished(
    kind: LegalKind,
  ): Promise<PlatformLegalDocumentRecord | undefined> {
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM platform_legal_documents
          WHERE kind = $1 AND status = 'published'
          ORDER BY version DESC LIMIT 1`,
        [kind],
      );
      const row = asRow(result.rows[0]);
      return row ? mapRow(row) : undefined;
    }
    return this.listAllMemory()
      .filter(
        (r) => r.kind === kind && r.status === "published",
      )
      .sort((a, b) => b.version - a.version)[0];
  }

  /** Every version of a kind, newest version first. */
  async listVersions(
    kind: LegalKind,
  ): Promise<PlatformLegalDocumentRecord[]> {
    if (this.db) {
      const result = await this.db.query(
        `SELECT * FROM platform_legal_documents
          WHERE kind = $1 ORDER BY version DESC`,
        [kind],
      );
      return mapRows(result.rows);
    }
    return this.listAllMemory()
      .filter((r) => r.kind === kind)
      .sort((a, b) => b.version - a.version);
  }

  /** The latest version of a kind regardless of status (for versioning). */
  async getLatest(
    kind: LegalKind,
  ): Promise<PlatformLegalDocumentRecord | undefined> {
    const versions = await this.listVersions(kind);
    return versions[0];
  }

  async listAll(): Promise<PlatformLegalDocumentRecord[]> {
    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM platform_legal_documents ORDER BY kind, version DESC",
        [],
      );
      return mapRows(result.rows);
    }
    return this.listAllMemory();
  }

  /**
   * Persists changed fields for a document. Callers (the service) must never
   * pass a body change for an already-published version — that path creates a
   * new draft instead. This method itself only writes what it is given.
   */
  async update(
    record: PlatformLegalDocumentRecord,
  ): Promise<PlatformLegalDocumentRecord> {
    if (this.db) {
      await this.db.query(
        `UPDATE platform_legal_documents
            SET title=$2, summary=$3, body_markdown=$4, status=$5,
                effective_date=$6, requires_reconsent=$7, updated_at=$8,
                published_at=$9
          WHERE id=$1`,
        [
          record.id,
          record.title,
          record.summary,
          record.bodyMarkdown,
          record.status,
          record.effectiveDate,
          record.requiresReconsent,
          record.updatedAt,
          record.publishedAt,
        ],
      );
      return record;
    }
    this.memory.set(record.id, record);
    return record;
  }

  private listAllMemory(): PlatformLegalDocumentRecord[] {
    return Array.from(this.memory.values());
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): Row | undefined {
  return row as Row | undefined;
}

function mapRows(
  rows: Record<string, unknown>[],
): PlatformLegalDocumentRecord[] {
  return rows
    .map(asRow)
    .filter((r): r is Row => r !== undefined)
    .map(mapRow);
}

function mapRow(row: Row): PlatformLegalDocumentRecord {
  return {
    id: row.id,
    kind: row.kind as LegalKind,
    version: Number(row.version),
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    status: row.status as LegalStatus,
    effectiveDate: row.effective_date,
    requiresReconsent: Boolean(row.requires_reconsent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
  };
}
