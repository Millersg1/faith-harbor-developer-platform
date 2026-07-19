import type { ProductStatus } from "./ProductStatus";

/**
 * Represents the information required to record a software product.
 */
export interface ProductRequest {
  /**
   * Optional client this product is built for.
   */
  clientId?: string;

  name: string;

  description?: string;

  /**
   * Defaults to "planning" when omitted.
   */
  status?: ProductStatus;

  repoUrl?: string;

  language?: string;

  version?: string;

  lastReleaseDate?: string;

  owner?: string;

  notes?: string;

  metadata?: Record<string, unknown>;
}
