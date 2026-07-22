/**
 * A login session. The token is the primary key (a long random secret);
 * the session records which user and organization it belongs to, so a
 * request bearing it can be scoped to the right tenant without any
 * further lookup.
 */
export interface PlatformSessionRecord {
  token: string;

  userId: string;

  organizationId: string;

  expiresAt: string;

  createdAt: string;
}
