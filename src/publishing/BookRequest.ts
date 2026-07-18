import type { BookStatus } from "./BookStatus";

/**
 * Represents the information required to record a book.
 */
export interface BookRequest {
  /**
   * Optional client (author) that owns the book.
   */
  clientId?: string;

  title: string;

  subtitle?: string;

  author: string;

  /**
   * Defaults to "draft" when omitted.
   */
  status?: BookStatus;

  format?: string;

  isbn?: string;

  wordCount?: number;

  targetDate?: string;

  publishedDate?: string;

  royalties?: number;

  notes?: string;

  metadata?: Record<string, unknown>;
}
