/**
 * A durable record that *something happened* in a tenant — the shared spine
 * that the Customer Journey Timeline reads, the Notification Center fans out
 * from, and (later) Workflows and Webhooks subscribe to.
 *
 * Modules never build timeline UI directly; they call
 * `ActivityService.record(...)` and the consumers react. Every event is
 * tenant-scoped.
 */

/** Who or what caused the event. */
export type ActivityActorType =
  | "user" // a team member
  | "portal" // a client-portal user
  | "system" // automation / worker
  | "ai"; // an AI action

/**
 * The kind of record the event is about, so the timeline can attach the
 * event to a client/lead/etc. Open-ended string (kept as a union of the
 * records we link today) — unknown values are tolerated.
 */
export type ActivitySubjectType =
  | "client"
  | "lead"
  | "project"
  | "proposal"
  | "invoice"
  | "ticket"
  | "campaign"
  | "review"
  | "website"
  | "domain"
  | "team"
  | "portal_user"
  | "drip"
  | (string & {});

export interface ActivityEventRecord {
  id: string;
  organizationId: string;

  /** Dotted event name, e.g. "invoice.paid", "proposal.accepted". */
  type: string;

  actorType: ActivityActorType;
  actorId?: string;
  actorName?: string;

  subjectType?: ActivitySubjectType;
  subjectId?: string;

  /** Human-readable one-liner shown on the timeline. */
  title: string;
  summary?: string;

  /** Extra structured detail (never secrets). */
  metadata?: Record<string, unknown>;

  createdAt: string;
}

export interface RecordActivityInput {
  type: string;
  actorType?: ActivityActorType;
  actorId?: string;
  actorName?: string;
  subjectType?: ActivitySubjectType;
  subjectId?: string;
  title: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}
