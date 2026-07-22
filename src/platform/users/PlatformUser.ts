export type PlatformUserRole =
  | "owner"
  | "admin"
  | "member";

export type PlatformUserStatus =
  | "active"
  | "suspended";

/**
 * A user account within one organization. Email is unique *per
 * organization*, so the same person can hold separate accounts in
 * different tenants — logging in always happens in a tenant's context.
 */
export interface PlatformUserRecord {
  id: string;

  organizationId: string;

  email: string;

  passwordHash: string;

  name?: string;

  role: PlatformUserRole;

  status: PlatformUserStatus;

  createdAt: string;

  updatedAt: string;
}

/**
 * A user as safe to return over the API — the password hash is never
 * included.
 */
export interface PublicPlatformUser {
  id: string;
  organizationId: string;
  email: string;
  name?: string;
  role: PlatformUserRole;
  status: PlatformUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformUserRequest {
  email: string;
  password: string;
  name?: string;
  role?: PlatformUserRole;
}

/**
 * Strips the password hash from a user record for safe exposure.
 */
export function toPublicUser(
  user: PlatformUserRecord,
): PublicPlatformUser {
  const {
    passwordHash: _passwordHash,
    ...safe
  } = user;

  return safe;
}
