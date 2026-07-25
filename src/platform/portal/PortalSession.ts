/**
 * A client-portal login session. Looked up by its opaque token (global, not
 * tenant-scoped — the token itself carries which org + client it belongs to),
 * mirroring how platform team sessions work.
 */
export interface PortalSessionRecord {
  token: string;
  clientUserId: string;
  organizationId: string;
  clientId: string;
  expiresAt: string;
  createdAt: string;
}
