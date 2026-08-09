import { randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * Honest delivery states for a marketing message:
 * - queued: enqueued, not yet attempted.
 * - sending: leased by a worker, transport attempt in flight.
 * - sent: transport accepted it (metered exactly once here).
 * - failed: a retryable failure BEFORE acceptance (not metered); re-attempted.
 * - terminal: retries exhausted (not metered).
 * - skipped: an eligibility gate failed at send time (not metered).
 * - delivery_unknown: a worker crashed while a message was `sending`; we cannot
 *   prove whether the transport accepted it, so we do NOT auto-resend — it is
 *   surfaced for manual review (not metered).
 */
export type OutboxStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "terminal"
  | "skipped"
  | "delivery_unknown";

export interface OutboxMessage {
  id: string;
  organizationId: string;
  enrollmentId: string | null;
  sequenceId: string | null;
  stepIndex: number;
  email: string;
  subject: string;
  body: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  providerId: string | null;
  messageIdHeader: string | null;
  reason: string | null;
  /** Set when an owner/admin resolves a delivery_unknown without resending. */
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One immutable attempt-history entry. COMPACT identifiers + enums ONLY — never
 * an email, name, body, address, consent wording, or token.
 */
export interface OutboxAttempt {
  id: string;
  outboxId: string;
  organizationId: string;
  attemptNo: number;
  event:
    | "sent"
    | "failed"
    | "terminal"
    | "skipped"
    | "delivery_unknown"
    | "manual_retry"
    | "manual_resolved"
    | "manual_cancel";
  providerId: string | null;
  reason: string | null;
  actor: string | null;
  createdAt: string;
}

/** Append-only attempt history. No update/delete — the log is immutable. */
export class MarketingOutboxAttemptRepository {
  private readonly rows: OutboxAttempt[] = [];

  constructor(private readonly db?: PgQueryable) {}

  async append(a: OutboxAttempt): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO marketing_outbox_attempts
           (id, outbox_id, organization_id, attempt_no, event, provider_id,
            reason, actor, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          a.id, a.outboxId, a.organizationId, a.attemptNo, a.event,
          a.providerId, a.reason, a.actor, a.createdAt,
        ],
      );
      return;
    }
    this.rows.push(a);
  }

  async list(outboxId: string): Promise<OutboxAttempt[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_outbox_attempts
           WHERE outbox_id=$1 ORDER BY created_at ASC`,
        [outboxId],
      );
      return (r.rows as unknown as AttemptRow[]).map(mapAttempt);
    }
    return this.rows.filter((a) => a.outboxId === outboxId);
  }

  async count(outboxId: string): Promise<number> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT COUNT(*)::int AS n FROM marketing_outbox_attempts WHERE outbox_id=$1",
        [outboxId],
      );
      return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0);
    }
    return this.rows.filter((a) => a.outboxId === outboxId).length;
  }
}

interface AttemptRow {
  id: string;
  outbox_id: string;
  organization_id: string;
  attempt_no: number;
  event: string;
  provider_id: string | null;
  reason: string | null;
  actor: string | null;
  created_at: string;
}

function mapAttempt(row: AttemptRow): OutboxAttempt {
  return {
    id: row.id,
    outboxId: row.outbox_id,
    organizationId: row.organization_id,
    attemptNo: Number(row.attempt_no),
    event: row.event as OutboxAttempt["event"],
    providerId: row.provider_id,
    reason: row.reason,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

export interface EnqueueInput {
  organizationId: string;
  enrollmentId: string;
  sequenceId: string;
  stepIndex: number;
  email: string;
  subject: string;
  body: string;
  runAt?: string;
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5 * 60 * 1000; // 5m, doubling

export class MarketingOutboxRepository {
  private readonly rows = new Map<string, OutboxMessage>();

  constructor(private readonly db?: PgQueryable) {}

  /** Idempotent enqueue keyed by (enrollment, step). Returns false if a row exists. */
  async enqueue(msg: OutboxMessage): Promise<boolean> {
    if (this.db) {
      const r = await this.db.query(
        `INSERT INTO marketing_outbox
           (id, organization_id, enrollment_id, sequence_id, step_index, email,
            subject, body, status, attempts, next_attempt_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (enrollment_id, step_index) DO NOTHING`,
        [
          msg.id, msg.organizationId, msg.enrollmentId, msg.sequenceId,
          msg.stepIndex, msg.email.toLowerCase(), msg.subject, msg.body,
          msg.status, msg.attempts, msg.nextAttemptAt, msg.createdAt,
          msg.updatedAt,
        ],
      );
      return (r.rowCount ?? 0) > 0;
    }
    const dupe = [...this.rows.values()].some(
      (m) =>
        m.enrollmentId === msg.enrollmentId && m.stepIndex === msg.stepIndex,
    );
    if (dupe) return false;
    this.rows.set(msg.id, msg);
    return true;
  }

  /**
   * Atomically lease due `queued`/`failed` messages (no live lease) for one
   * worker. Sets status='sending', lease_owner, lease_until. Returns the leased
   * messages.
   */
  async claimDue(
    owner: string,
    nowIso: string,
    leaseUntilIso: string,
    limit: number,
  ): Promise<OutboxMessage[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE marketing_outbox SET
            status='sending', lease_owner=$1, lease_until=$2, updated_at=$3
          WHERE id IN (
            SELECT id FROM marketing_outbox
             WHERE status IN ('queued','failed') AND next_attempt_at <= $3
             ORDER BY next_attempt_at ASC
             LIMIT $4
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [owner, leaseUntilIso, nowIso, limit],
      );
      return (r.rows as unknown as OutboxRow[]).map(mapRow);
    }
    const due = [...this.rows.values()]
      .filter(
        (m) =>
          (m.status === "queued" || m.status === "failed") &&
          m.nextAttemptAt <= nowIso,
      )
      .sort((a, b) => (a.nextAttemptAt < b.nextAttemptAt ? -1 : 1))
      .slice(0, limit);
    for (const m of due) {
      m.status = "sending";
      m.leaseOwner = owner;
      m.leaseUntil = leaseUntilIso;
      m.updatedAt = nowIso;
    }
    return due.map((m) => ({ ...m }));
  }

  /**
   * Recover messages stuck in `sending` with an EXPIRED lease (a crashed
   * worker). We cannot prove whether the transport accepted them, so mark them
   * `delivery_unknown` for manual review — never a blind resend. Returns count.
   */
  async recoverExpiredLeases(nowIso: string): Promise<OutboxMessage[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE marketing_outbox
            SET status='delivery_unknown', reason='crash:ambiguous',
                lease_owner=NULL, lease_until=NULL, updated_at=$1
          WHERE status='sending' AND lease_until IS NOT NULL AND lease_until < $1
          RETURNING *`,
        [nowIso],
      );
      return (r.rows as unknown as OutboxRow[]).map(mapRow);
    }
    const recovered: OutboxMessage[] = [];
    for (const m of this.rows.values()) {
      if (
        m.status === "sending" &&
        m.leaseUntil !== null &&
        m.leaseUntil < nowIso
      ) {
        m.status = "delivery_unknown";
        m.reason = "crash:ambiguous";
        m.leaseOwner = null;
        m.leaseUntil = null;
        m.updatedAt = nowIso;
        recovered.push({ ...m });
      }
    }
    return recovered;
  }

  async update(msg: OutboxMessage): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE marketing_outbox SET
            status=$2, attempts=$3, next_attempt_at=$4, lease_owner=$5,
            lease_until=$6, provider_id=$7, message_id_header=$8, reason=$9,
            resolved_at=$10, updated_at=$11
          WHERE id=$1`,
        [
          msg.id, msg.status, msg.attempts, msg.nextAttemptAt, msg.leaseOwner,
          msg.leaseUntil, msg.providerId, msg.messageIdHeader, msg.reason,
          msg.resolvedAt, msg.updatedAt,
        ],
      );
      return;
    }
    this.rows.set(msg.id, msg);
  }

  async get(id: string): Promise<OutboxMessage | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM marketing_outbox WHERE id=$1",
        [id],
      );
      const row = r.rows[0] as unknown as OutboxRow | undefined;
      return row ? mapRow(row) : undefined;
    }
    const m = this.rows.get(id);
    return m ? { ...m } : undefined;
  }

  /** Owner/admin visibility: failed / terminal / delivery_unknown for a tenant. */
  async listNeedsAttention(
    organizationId: string,
  ): Promise<OutboxMessage[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_outbox
           WHERE organization_id=$1
             AND status IN ('terminal','delivery_unknown')
             AND resolved_at IS NULL
           ORDER BY updated_at DESC LIMIT 500`,
        [organizationId],
      );
      return (r.rows as unknown as OutboxRow[]).map(mapRow);
    }
    return [...this.rows.values()].filter(
      (m) =>
        m.organizationId === organizationId &&
        m.resolvedAt === null &&
        (m.status === "terminal" || m.status === "delivery_unknown"),
    );
  }

  /** Tenant-scoped fetch for the review workflow (fail-closed on wrong org). */
  async getForOrg(
    id: string,
    organizationId: string,
  ): Promise<OutboxMessage | undefined> {
    const m = await this.get(id);
    return m && m.organizationId === organizationId ? m : undefined;
  }

  /**
   * Count messages currently in-flight (`sending`), for the concurrency limit.
   * `organizationId === null` counts platform-wide. Derived from durable row
   * state, so it survives restarts (a crashed lease is recovered separately).
   */
  async countSending(organizationId: string | null): Promise<number> {
    if (this.db) {
      const r = organizationId
        ? await this.db.query(
            "SELECT COUNT(*)::int AS n FROM marketing_outbox WHERE status='sending' AND organization_id=$1",
            [organizationId],
          )
        : await this.db.query(
            "SELECT COUNT(*)::int AS n FROM marketing_outbox WHERE status='sending'",
          );
      return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
    }
    let n = 0;
    for (const m of this.rows.values()) {
      if (
        m.status === "sending" &&
        (organizationId === null || m.organizationId === organizationId)
      ) {
        n += 1;
      }
    }
    return n;
  }

  /** Cancel queued/failed messages for an enrollment (pause/cancel). */
  async cancelForEnrollment(
    enrollmentId: string,
    nowIso: string,
  ): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE marketing_outbox
            SET status='skipped', reason='enrollment_canceled', updated_at=$2
          WHERE enrollment_id=$1 AND status IN ('queued','failed')`,
        [enrollmentId, nowIso],
      );
      return;
    }
    for (const m of this.rows.values()) {
      if (
        m.enrollmentId === enrollmentId &&
        (m.status === "queued" || m.status === "failed")
      ) {
        m.status = "skipped";
        m.reason = "enrollment_canceled";
        m.updatedAt = nowIso;
      }
    }
  }
}

interface OutboxRow {
  id: string;
  organization_id: string;
  enrollment_id: string | null;
  sequence_id: string | null;
  step_index: number;
  email: string;
  subject: string;
  body: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_until: string | null;
  provider_id: string | null;
  message_id_header: string | null;
  reason: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    enrollmentId: row.enrollment_id,
    sequenceId: row.sequence_id,
    stepIndex: Number(row.step_index),
    email: row.email,
    subject: row.subject,
    body: row.body,
    status: row.status as OutboxStatus,
    attempts: Number(row.attempts),
    nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until,
    providerId: row.provider_id,
    messageIdHeader: row.message_id_header,
    reason: row.reason,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Result of a transport attempt for one message. */
export type SendAttempt =
  | { outcome: "accepted"; providerId?: string; messageIdHeader?: string }
  | { outcome: "failed"; reason: string };

/** Eligibility recheck done immediately before handing to the transport. */
export type Eligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * The durable marketing send worker. Recovers crashed leases, claims due
 * messages under a lease, rechecks eligibility immediately before send, sends
 * via the injected transport, and records honest terminal state. A message is
 * marked `sent` (the single metering point) at most once.
 */
export class MarketingOutboxService {
  constructor(
    private readonly repo = new MarketingOutboxRepository(),
    private readonly now: () => number = () => Date.now(),
    private readonly attempts = new MarketingOutboxAttemptRepository(),
  ) {}

  private async logAttempt(
    m: OutboxMessage,
    event: OutboxAttempt["event"],
    extra: { providerId?: string | null; reason?: string | null; actor?: string | null } = {},
  ): Promise<void> {
    const n = (await this.attempts.count(m.id)) + 1;
    await this.attempts.append({
      id: randomUUID(),
      outboxId: m.id,
      organizationId: m.organizationId,
      attemptNo: n,
      event,
      providerId: extra.providerId ?? null,
      reason: extra.reason ?? null,
      actor: extra.actor ?? null,
      createdAt: new Date(this.now()).toISOString(),
    });
  }

  async enqueue(input: EnqueueInput): Promise<boolean> {
    const nowIso = new Date(this.now()).toISOString();
    return this.repo.enqueue({
      id: randomUUID(),
      organizationId: input.organizationId,
      enrollmentId: input.enrollmentId,
      sequenceId: input.sequenceId,
      stepIndex: input.stepIndex,
      email: input.email.toLowerCase(),
      subject: input.subject,
      body: input.body,
      status: "queued",
      attempts: 0,
      nextAttemptAt: input.runAt ?? nowIso,
      leaseOwner: null,
      leaseUntil: null,
      providerId: null,
      messageIdHeader: null,
      reason: null,
      resolvedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async needsAttention(organizationId: string): Promise<OutboxMessage[]> {
    return this.repo.listNeedsAttention(organizationId);
  }

  async history(outboxId: string): Promise<OutboxAttempt[]> {
    return this.attempts.list(outboxId);
  }

  async cancelForEnrollment(enrollmentId: string): Promise<void> {
    await this.repo.cancelForEnrollment(
      enrollmentId,
      new Date(this.now()).toISOString(),
    );
  }

  // ---- Owner/admin review workflow for delivery_unknown / terminal ----

  /** Mark a message resolved WITHOUT resending. Audited (compact, no PII). */
  async resolve(
    id: string,
    organizationId: string,
    actor: string,
  ): Promise<boolean> {
    const m = await this.repo.getForOrg(id, organizationId);
    if (!m) return false;
    const nowIso = new Date(this.now()).toISOString();
    await this.repo.update({ ...m, resolvedAt: nowIso, updatedAt: nowIso });
    await this.logAttempt(m, "manual_resolved", { actor });
    return true;
  }

  /**
   * Deliberate owner/admin retry of a delivery_unknown/terminal message. This
   * re-queues it for another attempt — it MAY produce a duplicate (the UI warns
   * prominently). It APPENDS a new attempt to the immutable history and never
   * overwrites prior attempts.
   */
  async retry(
    id: string,
    organizationId: string,
    actor: string,
  ): Promise<boolean> {
    const m = await this.repo.getForOrg(id, organizationId);
    if (!m) return false;
    const nowIso = new Date(this.now()).toISOString();
    await this.logAttempt(m, "manual_retry", { actor, reason: "operator_forced" });
    await this.repo.update({
      ...m,
      status: "queued",
      nextAttemptAt: nowIso,
      resolvedAt: null,
      leaseOwner: null,
      leaseUntil: null,
      reason: "manual_retry",
      updatedAt: nowIso,
    });
    return true;
  }

  /** Cancel a message (no further attempts). Audited. */
  async cancelMessage(
    id: string,
    organizationId: string,
    actor: string,
  ): Promise<boolean> {
    const m = await this.repo.getForOrg(id, organizationId);
    if (!m) return false;
    const nowIso = new Date(this.now()).toISOString();
    await this.repo.update({
      ...m,
      status: "skipped",
      reason: "manually_canceled",
      resolvedAt: nowIso,
      updatedAt: nowIso,
    });
    await this.logAttempt(m, "manual_cancel", { actor });
    return true;
  }

  /**
   * Run one worker pass. Returns counts by outcome. `eligibility` is rechecked
   * per-message immediately before send; `send` performs the transport attempt.
   */
  async runOnce(
    owner: string,
    deps: {
      eligibility: (m: OutboxMessage) => Promise<Eligibility>;
      send: (m: OutboxMessage) => Promise<SendAttempt>;
      leaseMs?: number;
      limit?: number;
    },
  ): Promise<{ sent: number; skipped: number; failed: number }> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const recovered = await this.repo.recoverExpiredLeases(nowIso);
    for (const rm of recovered) {
      await this.logAttempt(rm, "delivery_unknown", { reason: "crash:ambiguous" });
    }
    const leaseUntil = new Date(nowMs + (deps.leaseMs ?? 60_000)).toISOString();
    const claimed = await this.repo.claimDue(
      owner,
      nowIso,
      leaseUntil,
      deps.limit ?? 50,
    );
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const m of claimed) {
      // FINAL eligibility recheck — a suppression/unsubscribe committed after
      // enqueue (even while leased) stops the send here.
      const elig = await deps.eligibility(m);
      if (!elig.eligible) {
        await this.repo.update({
          ...m,
          status: "skipped",
          reason: elig.reason,
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: new Date(this.now()).toISOString(),
        });
        await this.logAttempt(m, "skipped", { reason: elig.reason });
        skipped += 1;
        continue;
      }
      let attempt: SendAttempt;
      try {
        attempt = await deps.send(m);
      } catch (e) {
        attempt = {
          outcome: "failed",
          reason: e instanceof Error ? e.message.slice(0, 80) : "send_error",
        };
      }
      const afterIso = new Date(this.now()).toISOString();
      if (attempt.outcome === "accepted") {
        // Single metering point (a message is metered iff/when it reaches
        // `sent`). This confirms SMTP ACCEPTANCE, not guaranteed delivery.
        await this.repo.update({
          ...m,
          status: "sent",
          providerId: attempt.providerId ?? null,
          messageIdHeader: attempt.messageIdHeader ?? null,
          reason: "sent",
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: afterIso,
        });
        await this.logAttempt(m, "sent", { providerId: attempt.providerId ?? null });
        sent += 1;
      } else {
        const attempts = m.attempts + 1;
        const terminal = attempts >= MAX_ATTEMPTS;
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
        await this.repo.update({
          ...m,
          status: terminal ? "terminal" : "failed",
          attempts,
          reason: attempt.reason.slice(0, 80),
          nextAttemptAt: new Date(this.now() + backoff).toISOString(),
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: afterIso,
        });
        await this.logAttempt(m, terminal ? "terminal" : "failed", {
          reason: attempt.reason.slice(0, 80),
        });
        failed += 1;
      }
    }
    return { sent, skipped, failed };
  }
}
