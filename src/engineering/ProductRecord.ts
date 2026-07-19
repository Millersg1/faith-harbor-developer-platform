import type { ProductStatus } from "./ProductStatus";

/**
 * Represents a software product or repository tracked by the
 * Engineering department.
 */
export interface ProductRecord {
  id: string;

  /**
   * Client this product is built for, if any.
   * Undefined for Faith Harbor's own software.
   */
  clientId?: string;

  /**
   * Product or repository name.
   */
  name: string;

  /**
   * Short description.
   */
  description?: string;

  /**
   * Current lifecycle state.
   */
  status: ProductStatus;

  /**
   * Repository URL (for example a GitHub link).
   */
  repoUrl?: string;

  /**
   * Primary language or stack.
   */
  language?: string;

  /**
   * Current released version.
   */
  version?: string;

  /**
   * Date of the last release.
   */
  lastReleaseDate?: string;

  /**
   * Engineer or owner responsible.
   */
  owner?: string;

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
