import type { KnowledgeRepository } from "./KnowledgeRepository";
import type { RetrievedChunk } from "./KnowledgeTypes";

/**
 * Retrieves the chunks most relevant to a query within one collection.
 *
 * Deliberately embedding-agnostic: the v1 KeywordRetrievalProvider scores by
 * term overlap over Postgres, and a future pgvector-backed provider can
 * implement the same interface without any change to the service or API.
 */
export interface RetrievalProvider {
  retrieve(
    collectionId: string,
    query: string,
    limit: number,
  ): Promise<RetrievedChunk[]>;
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "was",
  "with",
  "you",
  "your",
  "our",
  "what",
  "which",
  "how",
  "can",
  "does",
  "did",
  "this",
  "that",
  "from",
  "have",
  "has",
]);

/** Tokenizes a query into distinct, meaningful lowercase terms. */
export function queryTerms(
  query: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of query
    .toLowerCase()
    .split(/[^a-z0-9]+/)) {
    if (
      raw.length < 3 ||
      STOPWORDS.has(raw) ||
      seen.has(raw)
    ) {
      continue;
    }

    seen.add(raw);
    out.push(raw);

    if (out.length >= 12) break;
  }

  return out;
}

/**
 * Keyword retrieval: fetch candidate chunks that match any query term, then
 * rank by how many term occurrences each contains.
 */
export class KeywordRetrievalProvider
  implements RetrievalProvider
{
  constructor(
    private readonly repository: KnowledgeRepository,
  ) {}

  async retrieve(
    collectionId: string,
    query: string,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const terms = queryTerms(query);

    if (terms.length === 0) return [];

    const candidates =
      await this.repository.candidateChunks(
        collectionId,
        terms,
        100,
      );

    return candidates
      .map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        documentName:
          c.documentName,
        content: c.content,
        score: scoreContent(
          c.content,
          terms,
        ),
      }))
      .filter((c) => c.score > 0)
      .sort(
        (a, b) => b.score - a.score,
      )
      .slice(0, limit);
  }
}

function scoreContent(
  content: string,
  terms: string[],
): number {
  const lc = content.toLowerCase();
  let score = 0;

  for (const term of terms) {
    let idx = lc.indexOf(term);
    while (idx !== -1) {
      score += 1;
      idx = lc.indexOf(
        term,
        idx + term.length,
      );
    }
  }

  return score;
}
