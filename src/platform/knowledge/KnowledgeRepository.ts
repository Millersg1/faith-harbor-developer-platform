import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  DocumentStatus,
  KnowledgeChunkRecord,
  KnowledgeCollectionRecord,
  KnowledgeDocumentRecord,
} from "./KnowledgeTypes";

export interface CandidateChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
}

interface CollectionRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  organization_id: string;
  collection_id: string;
  name: string;
  mime_type: string;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: string;
}

/**
 * Stores knowledge collections, documents, and chunks — every read and write
 * scoped to the acting tenant, including {@link candidateChunks}, so
 * retrieval can never surface another tenant's material.
 */
export class KnowledgeRepository extends TenantScopedRepository {
  private readonly collections =
    new Map<
      string,
      KnowledgeCollectionRecord
    >();

  private readonly documents =
    new Map<
      string,
      KnowledgeDocumentRecord
    >();

  private readonly chunks: KnowledgeChunkRecord[] =
    [];

  // ---- Collections ----

  async createCollection(
    record: Omit<
      KnowledgeCollectionRecord,
      "organizationId"
    >,
  ): Promise<KnowledgeCollectionRecord> {
    const organizationId =
      this.tenantId();
    const full = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO knowledge_collections
           (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          full.id,
          full.organizationId,
          full.name,
          full.description ?? null,
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.collections.set(
      full.id,
      full,
    );

    return full;
  }

  async listCollections(): Promise<
    KnowledgeCollectionRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM knowledge_collections
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return (
        result.rows as unknown as CollectionRow[]
      ).map(mapCollection);
    }

    return [
      ...this.collections.values(),
    ].filter(
      (c) =>
        c.organizationId ===
        organizationId,
    );
  }

  async getCollection(
    id: string,
  ): Promise<
    | KnowledgeCollectionRecord
    | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM knowledge_collections WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | CollectionRow
        | undefined;

      return row
        ? mapCollection(row)
        : undefined;
    }

    const record =
      this.collections.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  // ---- Documents ----

  async createDocument(
    record: Omit<
      KnowledgeDocumentRecord,
      "organizationId"
    >,
  ): Promise<KnowledgeDocumentRecord> {
    const organizationId =
      this.tenantId();
    const full = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO knowledge_documents
           (id, organization_id, collection_id, name, mime_type, status,
            chunk_count, error, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          full.id,
          full.organizationId,
          full.collectionId,
          full.name,
          full.mimeType,
          full.status,
          full.chunkCount,
          full.error ?? null,
          full.createdAt,
        ],
      );

      return full;
    }

    this.documents.set(
      full.id,
      full,
    );

    return full;
  }

  async listDocuments(
    collectionId: string,
  ): Promise<
    KnowledgeDocumentRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM knowledge_documents
            WHERE organization_id = $1 AND collection_id = $2
            ORDER BY created_at DESC`,
          [
            organizationId,
            collectionId,
          ],
        );

      return (
        result.rows as unknown as DocumentRow[]
      ).map(mapDocument);
    }

    return [
      ...this.documents.values(),
    ].filter(
      (d) =>
        d.organizationId ===
          organizationId &&
        d.collectionId ===
          collectionId,
    );
  }

  async getDocument(
    id: string,
  ): Promise<
    KnowledgeDocumentRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM knowledge_documents WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | DocumentRow
        | undefined;

      return row
        ? mapDocument(row)
        : undefined;
    }

    const record =
      this.documents.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async updateDocument(
    record: KnowledgeDocumentRecord,
  ): Promise<KnowledgeDocumentRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE knowledge_documents
            SET status = $3, chunk_count = $4, error = $5
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.status,
          record.chunkCount,
          record.error ?? null,
        ],
      );

      return record;
    }

    if (
      this.documents.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.documents.set(
        record.id,
        record,
      );
    }

    return record;
  }

  async deleteDocument(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM knowledge_documents WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );
      await this.db.query(
        "DELETE FROM knowledge_chunks WHERE document_id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    this.documents.delete(id);
    for (
      let i = this.chunks.length - 1;
      i >= 0;
      i--
    ) {
      if (
        this.chunks[i].documentId ===
          id &&
        this.chunks[i]
          .organizationId ===
          organizationId
      ) {
        this.chunks.splice(i, 1);
      }
    }
  }

  // ---- Chunks ----

  async createChunks(
    records: KnowledgeChunkRecord[],
  ): Promise<void> {
    if (records.length === 0) return;

    if (this.db) {
      for (const c of records) {
        await this.db.query(
          `INSERT INTO knowledge_chunks
             (id, organization_id, collection_id, document_id, position,
              content, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            c.id,
            c.organizationId,
            c.collectionId,
            c.documentId,
            c.position,
            c.content,
            c.createdAt,
          ],
        );
      }

      return;
    }

    this.chunks.push(...records);
  }

  /**
   * Candidate chunks for a query: those whose content matches any search
   * term, joined to their document name for citations. Tenant-scoped. The
   * caller (retrieval provider) ranks these.
   */
  async candidateChunks(
    collectionId: string,
    terms: string[],
    limit: number,
  ): Promise<CandidateChunk[]> {
    const organizationId =
      this.tenantId();

    if (terms.length === 0) return [];

    if (this.db) {
      const params: unknown[] = [
        organizationId,
        collectionId,
      ];
      const likes = terms.map(
        (t) => {
          params.push(`%${t}%`);

          return `c.content ILIKE $${params.length}`;
        },
      );
      params.push(limit);

      const result =
        await this.db.query(
          `SELECT c.id AS chunk_id, c.document_id, c.content,
                  d.name AS document_name
             FROM knowledge_chunks c
             JOIN knowledge_documents d ON d.id = c.document_id
            WHERE c.organization_id = $1 AND c.collection_id = $2
              AND (${likes.join(" OR ")})
            LIMIT $${params.length}`,
          params,
        );

      return (
        result.rows as unknown as {
          chunk_id: string;
          document_id: string;
          content: string;
          document_name: string;
        }[]
      ).map((r) => ({
        chunkId: r.chunk_id,
        documentId: r.document_id,
        content: r.content,
        documentName:
          r.document_name,
      }));
    }

    const docName = (
      id: string,
    ): string =>
      this.documents.get(id)?.name ??
      "Document";

    return this.chunks
      .filter(
        (c) =>
          c.organizationId ===
            organizationId &&
          c.collectionId ===
            collectionId &&
          terms.some((t) =>
            c.content
              .toLowerCase()
              .includes(
                t.toLowerCase(),
              ),
          ),
      )
      .slice(0, limit)
      .map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        content: c.content,
        documentName: docName(
          c.documentId,
        ),
      }));
  }
}

function mapCollection(
  row: CollectionRow,
): KnowledgeCollectionRecord {
  const record: KnowledgeCollectionRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.description)
    record.description =
      row.description;

  return record;
}

function mapDocument(
  row: DocumentRow,
): KnowledgeDocumentRecord {
  const record: KnowledgeDocumentRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      collectionId:
        row.collection_id,
      name: row.name,
      mimeType: row.mime_type,
      status:
        row.status as DocumentStatus,
      chunkCount: Number(
        row.chunk_count,
      ),
      createdAt: row.created_at,
    };

  if (row.error)
    record.error = row.error;

  return record;
}
