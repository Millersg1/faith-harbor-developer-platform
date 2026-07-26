/**
 * Metadata for one stored file in a tenant. The bytes live in a
 * StorageProvider under {@link storedKey}; this row is the tenant-scoped,
 * authorizable record of them.
 */
export interface PlatformFileRecord {
  id: string;
  organizationId: string;

  /** Original, display filename (sanitized — never used as a path). */
  name: string;

  /** Opaque storage key (tenant-prefixed UUID). Never client-supplied. */
  storedKey: string;

  mimeType: string;
  size: number;

  tags: string[];

  /** Optional link to a record (client, project, …) for context. */
  subjectType?: string;
  subjectId?: string;

  uploadedBy?: string;

  /** ISO timestamp when soft-deleted, or undefined while live. */
  deletedAt?: string;

  createdAt: string;
}

export interface UploadFileRequest {
  name: string;
  mimeType: string;
  /** Base64-encoded contents. */
  data: string;
  tags?: string[];
  subjectType?: string;
  subjectId?: string;
  uploadedBy?: string;
}
