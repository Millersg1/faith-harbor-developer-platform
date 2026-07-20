/**
 * An API key lets an external system (for example a product's Stripe
 * webhook) authenticate to the SaaS Surface API without a browser
 * session. Only the hash of the key is ever stored; the raw key is
 * shown once, at creation, and never again.
 */
export interface ApiKeyRecord {
  id: string;

  /**
   * Human label, e.g. "SaaS Surface — product launches".
   */
  name: string;

  /**
   * The brand this key acts on behalf of, if any. Sequences and
   * enrollments created with the key inherit this brand, so each
   * business's onboarding email speaks in its own voice.
   */
  brandId?: string;

  /**
   * SHA-256 hex digest of the raw key. The raw key is never stored.
   */
  keyHash: string;

  /**
   * The visible prefix of the raw key (e.g. "fhk_ab12cd"), safe to
   * display so a key can be recognized in a list.
   */
  prefix: string;

  createdAt: string;

  lastUsedAt?: string;
}

/**
 * The public view of a key (never includes the hash).
 */
export interface ApiKeySummary {
  id: string;
  name: string;
  brandId?: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

/**
 * The one-time result of creating a key: the summary plus the raw
 * key, which the caller must copy now because it cannot be recovered.
 */
export interface CreatedApiKey {
  key: string;
  apiKey: ApiKeySummary;
}
