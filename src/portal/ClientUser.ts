/**
 * A login account for one client, used to sign in to the client
 * portal. A user belongs to exactly one client and can only ever see
 * that client's data.
 */
export interface ClientUser {
  id: string;
  clientId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

/**
 * A client user without the password hash, safe to return over the
 * API.
 */
export interface PublicClientUser {
  id: string;
  clientId: string;
  email: string;
  createdAt: string;
}

export function toPublicClientUser(
  user: ClientUser,
): PublicClientUser {
  return {
    id: user.id,
    clientId: user.clientId,
    email: user.email,
    createdAt: user.createdAt,
  };
}
