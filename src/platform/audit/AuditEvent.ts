/**
 * A security-relevant, append-only audit record. Distinct from the activity
 * event spine (business timeline): this is the "who did what, when, from
 * where" trail for security and compliance — logins, password/role changes,
 * removals, admin actions. Records are never updated or deleted.
 */

export type AuditActorType =
  | "user"
  | "admin"
  | "portal"
  | "system";

export interface AuditEventRecord {
  id: string;
  organizationId: string;

  /** Dotted action, e.g. "auth.login", "user.role_changed". */
  action: string;

  actorType: AuditActorType;
  actorId?: string;
  actorLabel?: string;

  /** What the action was performed on, when applicable. */
  targetType?: string;
  targetId?: string;

  /** Whether the action succeeded (e.g. login). */
  outcome?: "success" | "failure";

  ip?: string;

  /** Extra non-sensitive detail (never passwords/tokens/secrets). */
  metadata?: Record<string, unknown>;

  createdAt: string;
}

export interface RecordAuditInput {
  action: string;
  actorType?: AuditActorType;
  actorId?: string;
  actorLabel?: string;
  targetType?: string;
  targetId?: string;
  outcome?: "success" | "failure";
  ip?: string;
  metadata?: Record<string, unknown>;
}
