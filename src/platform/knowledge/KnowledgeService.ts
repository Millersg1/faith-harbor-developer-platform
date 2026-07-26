import { randomUUID } from "node:crypto";

import { KnowledgeRepository } from "./KnowledgeRepository";
import {
  KeywordRetrievalProvider,
  type RetrievalProvider,
} from "./RetrievalProvider";
import type {
  KnowledgeChunkRecord,
  KnowledgeCollectionRecord,
  KnowledgeDocumentRecord,
  RetrievedChunk,
} from "./KnowledgeTypes";

export class KnowledgeValidationError extends Error {}
export class KnowledgeNotFoundError extends Error {}

/** Content types we can ingest as text today. */
const TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const CHUNK_TARGET = 900;
const MAX_CONTENT = 500_000;

export interface AddDocumentRequest {
  collectionId: string;
  name: string;
  mimeType: string;
  content: string;
}

export interface KnowledgeAnswer {
  chunks: RetrievedChunk[];
  /** Distinct source document names cited. */
  citations: string[];
}

/**
 * Runs a tenant's AI knowledge base: collections, text-document ingestion
 * (chunked), and grounded retrieval with citations. Every operation is
 * tenant-scoped; retrieval only ever returns the tenant's own chunks.
 *
 * Retrieval is delegated to a {@link RetrievalProvider} (keyword by default,
 * pgvector-swappable later). Answers are grounded strictly in retrieved
 * chunks — the service never fabricates content beyond them.
 */
export class KnowledgeService {
  private readonly retrieval: RetrievalProvider;

  private readonly now: () => number;

  constructor(
    private readonly repository =
      new KnowledgeRepository(),
    options: {
      retrieval?: RetrievalProvider;
      now?: () => number;
    } = {},
  ) {
    this.retrieval =
      options.retrieval ??
      new KeywordRetrievalProvider(
        repository,
      );
    this.now =
      options.now ??
      (() => Date.now());
  }

  async createCollection(request: {
    name: string;
    description?: string;
  }): Promise<KnowledgeCollectionRecord> {
    const name =
      request.name.trim();

    if (!name) {
      throw new KnowledgeValidationError(
        "A collection needs a name.",
      );
    }

    const nowIso = new Date(
      this.now(),
    ).toISOString();

    return this.repository.createCollection(
      {
        id: randomUUID(),
        name,
        description:
          request.description?.trim() ||
          undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    );
  }

  async listCollections(): Promise<
    readonly KnowledgeCollectionRecord[]
  > {
    return this.repository.listCollections();
  }

  async addDocument(
    request: AddDocumentRequest,
  ): Promise<KnowledgeDocumentRecord> {
    const collection =
      await this.repository.getCollection(
        request.collectionId,
      );

    if (!collection) {
      throw new KnowledgeNotFoundError(
        "Collection not found.",
      );
    }

    const name =
      request.name.trim() ||
      "Untitled";
    const mimeType = (
      request.mimeType || ""
    )
      .trim()
      .toLowerCase();

    if (!TEXT_MIME.has(mimeType)) {
      throw new KnowledgeValidationError(
        "Only text documents (plain, markdown, csv, json) can be indexed today.",
      );
    }

    const content =
      request.content ?? "";

    if (!content.trim()) {
      throw new KnowledgeValidationError(
        "The document is empty.",
      );
    }

    if (
      content.length > MAX_CONTENT
    ) {
      throw new KnowledgeValidationError(
        "That document is too large to index.",
      );
    }

    const nowIso = new Date(
      this.now(),
    ).toISOString();
    const documentId = randomUUID();

    const pieces = chunkText(content);
    const chunks: KnowledgeChunkRecord[] =
      pieces.map((text, i) => ({
        id: randomUUID(),
        organizationId:
          collection.organizationId,
        collectionId:
          collection.id,
        documentId,
        position: i,
        content: text,
        createdAt: nowIso,
      }));

    // Create the document first (processing), then its chunks, then mark
    // ready — so a partial failure is visible as 'failed', not silently lost.
    const document =
      await this.repository.createDocument(
        {
          id: documentId,
          collectionId:
            collection.id,
          name,
          mimeType,
          status: "processing",
          chunkCount: 0,
          createdAt: nowIso,
        },
      );

    try {
      await this.repository.createChunks(
        chunks,
      );

      return this.repository.updateDocument(
        {
          ...document,
          status: "ready",
          chunkCount: chunks.length,
        },
      );
    } catch (error) {
      await this.repository.updateDocument(
        {
          ...document,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Indexing failed.",
        },
      );

      throw error;
    }
  }

  async listDocuments(
    collectionId: string,
  ): Promise<
    readonly KnowledgeDocumentRecord[]
  > {
    return this.repository.listDocuments(
      collectionId,
    );
  }

  async deleteDocument(
    id: string,
  ): Promise<void> {
    const doc =
      await this.repository.getDocument(
        id,
      );

    if (!doc) {
      throw new KnowledgeNotFoundError(
        "Document not found.",
      );
    }

    await this.repository.deleteDocument(
      id,
    );
  }

  /**
   * Answers a question from a collection by retrieving the most relevant
   * chunks and citing their source documents. Returns empty when nothing
   * relevant is found — never fabricated content.
   */
  async query(
    collectionId: string,
    question: string,
    limit = 5,
  ): Promise<KnowledgeAnswer> {
    const collection =
      await this.repository.getCollection(
        collectionId,
      );

    if (!collection) {
      throw new KnowledgeNotFoundError(
        "Collection not found.",
      );
    }

    const chunks =
      await this.retrieval.retrieve(
        collectionId,
        question,
        limit,
      );

    const citations = [
      ...new Set(
        chunks.map(
          (c) => c.documentName,
        ),
      ),
    ];

    return { chunks, citations };
  }
}

/**
 * Splits text into ~CHUNK_TARGET-character chunks on paragraph boundaries,
 * further splitting any oversized paragraph. Keeps chunks whole where it can
 * so retrieved passages read naturally.
 */
export function chunkText(
  content: string,
): string[] {
  const paragraphs = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = (): void => {
    if (current.trim()) {
      chunks.push(current.trim());
    }
    current = "";
  };

  for (const para of paragraphs) {
    if (
      para.length > CHUNK_TARGET
    ) {
      flush();
      for (
        let i = 0;
        i < para.length;
        i += CHUNK_TARGET
      ) {
        chunks.push(
          para
            .slice(
              i,
              i + CHUNK_TARGET,
            )
            .trim(),
        );
      }
      continue;
    }

    if (
      current.length +
        para.length +
        2 >
      CHUNK_TARGET
    ) {
      flush();
    }

    current = current
      ? current + "\n\n" + para
      : para;
  }

  flush();

  return chunks;
}
