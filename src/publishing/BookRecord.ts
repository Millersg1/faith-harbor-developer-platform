import type { BookStatus } from "./BookStatus";

/**
 * Represents a book tracked by Faith Harbor Publishing.
 */
export interface BookRecord {
  id: string;

  /**
   * Client (author) this book belongs to.
   * Undefined when the book is not linked to a client.
   */
  clientId?: string;

  /**
   * Book title.
   */
  title: string;

  /**
   * Optional subtitle.
   */
  subtitle?: string;

  /**
   * Author name.
   */
  author: string;

  /**
   * Current production stage.
   */
  status: BookStatus;

  /**
   * Format (for example "Paperback", "eBook", "Audiobook").
   */
  format?: string;

  /**
   * ISBN, when assigned.
   */
  isbn?: string;

  /**
   * Manuscript word count.
   */
  wordCount?: number;

  /**
   * Target publication date.
   */
  targetDate?: string;

  /**
   * Actual publication date.
   */
  publishedDate?: string;

  /**
   * Royalties earned to date.
   */
  royalties?: number;

  /**
   * Internal notes.
   */
  notes?: string;

  /**
   * Extensible metadata.
   */
  metadata?: Record<string, unknown>;

  /**
   * Audit timestamps.
   */
  createdAt: string;
  updatedAt: string;
}
