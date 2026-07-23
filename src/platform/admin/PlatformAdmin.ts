/**
 * A platform administrator — All Elite Cloud staff.
 *
 * Unlike a {@link PlatformUserRecord}, an admin does NOT belong to any
 * organization: they operate *across* all tenants (the top "Platform
 * Administration" tier). Email is globally unique. This account type can
 * never be used as a tenant user, and a tenant user can never be used
 * here — the two live in separate tables with separate sessions.
 */
export interface PlatformAdminRecord {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPlatformAdmin {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface CreatePlatformAdminRequest {
  email: string;
  password: string;
  name?: string;
}

export function toPublicAdmin(
  admin: PlatformAdminRecord,
): PublicPlatformAdmin {
  const pub: PublicPlatformAdmin = {
    id: admin.id,
    email: admin.email,
    createdAt: admin.createdAt,
  };

  if (admin.name) {
    pub.name = admin.name;
  }

  return pub;
}
