/**
 * A portal login for one of a tenant's clients. It belongs to exactly one
 * organization and one client within it, and can only ever see that client's
 * data. This is how a tenant's customers sign in to the client portal.
 */
export interface ClientUserRecord {
  id: string;
  organizationId: string;
  clientId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

/** A client user without the password hash — safe to return over the API. */
export interface PublicClientUser {
  id: string;
  clientId: string;
  email: string;
  createdAt: string;
}

export function toPublicClientUser(
  user: ClientUserRecord,
): PublicClientUser {
  return {
    id: user.id,
    clientId: user.clientId,
    email: user.email,
    createdAt: user.createdAt,
  };
}
