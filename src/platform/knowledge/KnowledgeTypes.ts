/**
 * Tenant AI knowledge base: collections of documents, split into chunks that
 * a retrieval provider searches to ground answers. Isolation holds at the
 * collection, document, chunk, and query level — a tenant can only ever
 * retrieve from its own material.
 *
 * v1 retrieval is keyword-based over Postgres; the RetrievalProvider
 * abstraction is deliberately embedding-agnostic so a pgvector-backed
 * provider can replace it without touching the service or API.
 */

export interface KnowledgeCollectionRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentStatus =
  | "processing"
  | "ready"
  | "failed";

export interface KnowledgeDocumentRecord {
  id: string;
  organizationId: string;
  collectionId: string;
  name: string;
  mimeType: string;
  status: DocumentStatus;
  chunkCount: number;
  error?: string;
  createdAt: string;
}

export interface KnowledgeChunkRecord {
  id: string;
  organizationId: string;
  collectionId: string;
  documentId: string;
  position: number;
  content: string;
  createdAt: string;
}

/** A retrieval hit: the chunk plus its source, for citations. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
}
