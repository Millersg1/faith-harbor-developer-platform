import { randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";
import { runWithTenant } from "../../tenancy/TenantContext";
import type { DoubleOptInService } from "./DoubleOptInService";
import type { MarketingSenderService } from "./MarketingSenderService";
import type { EmailDeliveryProvider } from "../email/EmailDeliveryProvider";

/**
 * Durable, crash-safe dispatch of DOUBLE-OPT-IN CONFIRMATION emails.
 *
 * This is deliberately SEPARATE from the marketing outbox:
 *  - A confirmation email is TRANSACTIONAL, not a marketing broadcast. It must
 *    carry NO List-Unsubscribe / one-click headers and must NEVER be metered as
 *    a marketing send. (Unsubscribe headers belong only on actual marketing
 *    messages sent AFTER the recipient has confirmed.)
 *  - There is no enrollment/sequence/step yet at confirmation time — enrollment
 *    only happens after confirmation — so the marketing outbox's
 *    (enrollment, step) shape does not apply. Dispatch is keyed by ACTIVATION.
 *
 * Honesty boundary mirrors the outbox: `sent` means the SMTP server accepted
 * responsibility (NOT inbox delivery); a crashed lease or an ambiguous transport
 * result becomes `delivery_unknown` and is NEVER blind-resent. A deliberate
 * retry (a pre-acceptance failure) mints a BRAND-NEW confirmation token — the
 * raw token is never stored, so nothing is replayed from storage.
 */
export type DispatchStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "terminal"
  | "delivery_unknown"
  | "skipped";

export interface DispatchRecord {
  id: string;
  organizationId: string;
  /** The marketing activation this confirmation is for (idempotency key). */
  activationId: string;
  email: string;
  /** Bound consent terms carried so a send can mint a token without a lookup. */
  consentRef: string | null;
  consentVersion: string | null;
  /** Canonical origin for the confirmation link (tenant's own host). */
  confirmBase: string;
  status: DispatchStatus;
  attempts: number;
  nextAttemptAt: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  providerId: string | null;
  reason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueDispatchInput {
  organizationId: string;
  activationId: string;
  email: string;
  consentRef?: string | null;
  consentVersion?: string | null;
  confirmBase: string;
  runAt?: string;
}

/** Honest transport result for one confirmation-send attempt. */
export type DispatchAttempt =
  | { classification: "accepted"; providerId?: string }
  /** Interrupted/ambiguous — may or may not have been accepted. No auto-retry. */
  | { classification: "uncertain"; reason?: string }
  /** Clearly before acceptance (connection/TLS/auth/4xx/sender-incomplete). Retry. */
  | { classification: "pre_acceptance_failure"; reason?: string }
  /** Permanent pre-acceptance rejection (5xx / header injection). No retry. */
  | { classification: "rejected"; reason?: string };

/** Eligibility recheck immediately before send (e.g. suppression). */
export type DispatchEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Build the TRANSACTIONAL confirmation email body + headers. It carries the
 * business's physical address (honest sender identity) but deliberately NO
 * List-Unsubscribe / one-click headers and no unsubscribe link — those belong
 * only on actual marketing messages sent after confirmation. `confirmUrl` puts
 * the token in the URL FRAGMENT so it never reaches a server log or Referer.
 */
export function buildConfirmationMessage(input: {
  fromName: string;
  physicalAddress: string;
  confirmUrl: string;
}): { subject: string; text: string; headers: Record<string, string> } {
  const subject = "Please confirm your subscription";
  const text =
    `You (or someone using this address) asked to receive marketing emails ` +
    `from ${input.fromName}.\n\n` +
    `Confirm to start receiving them:\n${input.confirmUrl}\n\n` +
    `If you didn't request this, simply ignore this email — you won't be ` +
    `subscribed.\n\n` +
    `${input.fromName}\n${input.physicalAddress}`;
  // No List-Unsubscribe here: this is a transactional confirmation, not a
  // marketing message.
  return { subject, text, headers: {} };
}

/**
 * Compose a durable-dispatch `send` callback. On each attempt it mints a
 * BRAND-NEW confirmation token (so nothing is replayed from storage), resolves
 * the tenant's marketing sender identity (FAIL-CLOSED → retryable), and delivers
 * a transactional message. It returns an honest classification for the state
 * machine and never leaks addresses/SMTP internals.
 */
export function createConfirmationSend(deps: {
  doubleOptIn: DoubleOptInService;
  marketingSender: MarketingSenderService;
  emailProvider: EmailDeliveryProvider;
}): (m: DispatchRecord) => Promise<DispatchAttempt> {
  return async (m: DispatchRecord): Promise<DispatchAttempt> => {
    const resolution = await runWithTenant(
      { organizationId: m.organizationId },
      () => deps.marketingSender.resolve(),
    );
    if (!resolution.ok) {
      // Sender not yet configured/approved → pre-acceptance, retryable.
      return {
        classification: "pre_acceptance_failure",
        reason: `sender_${resolution.reason}`,
      };
    }
    const sender = resolution.sender;
    // A fresh token each attempt; older siblings are invalidated on first
    // confirm. The raw token exists only for this message — never stored.
    const raw = await deps.doubleOptIn.mint({
      organizationId: m.organizationId,
      email: m.email,
      consentId: m.consentRef,
      version: m.consentVersion,
    });
    const confirmUrl = `${m.confirmBase}/marketing/confirm#c=${raw}`;
    const { subject, text, headers } = buildConfirmationMessage({
      fromName: sender.fromName,
      physicalAddress: sender.physicalAddress,
      confirmUrl,
    });
    const sendingDomain =
      /@([^>\s]+)/.exec(sender.fromAddress)?.[1]?.toLowerCase() ?? "localhost";
    const result = await deps.emailProvider.deliver({
      to: m.email,
      from: `${sender.fromName} <${sender.fromAddress}>`,
      replyTo: sender.replyTo,
      subject,
      text,
      headers,
      messageClass: "transactional",
      logicalId: `doi-confirm:${m.activationId}`,
      attemptId: randomUUID(),
      sendingDomain,
    });
    if (result.classification === "accepted") {
      return { classification: "accepted", providerId: result.providerId };
    }
    return {
      classification: result.classification,
      reason: result.responseCategory ?? result.reason,
    };
  };
}

interface Row {
  id: string;
  organization_id: string;
  activation_id: string;
  email: string;
  consent_ref: string | null;
  consent_version: string | null;
  confirm_base: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_until: string | null;
  provider_id: string | null;
  reason: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: Row): DispatchRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    activationId: row.activation_id,
    email: row.email,
    consentRef: row.consent_ref,
    consentVersion: row.consent_version,
    confirmBase: row.confirm_base,
    status: row.status as DispatchStatus,
    attempts: Number(row.attempts),
    nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until,
    providerId: row.provider_id,
    reason: row.reason,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ConfirmationDispatchRepository {
  private readonly rows = new Map<string, DispatchRecord>();

  constructor(private readonly db?: PgQueryable) {}

  /** Idempotent enqueue keyed by activation_id. Returns false if one exists. */
  async enqueue(msg: DispatchRecord): Promise<boolean> {
    if (this.db) {
      const r = await this.db.query(
        `INSERT INTO confirmation_dispatch
           (id, organization_id, activation_id, email, consent_ref,
            consent_version, confirm_base, status, attempts, next_attempt_at,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (activation_id) DO NOTHING`,
        [
          msg.id, msg.organizationId, msg.activationId, msg.email.toLowerCase(),
          msg.consentRef, msg.consentVersion, msg.confirmBase, msg.status,
          msg.attempts, msg.nextAttemptAt, msg.createdAt, msg.updatedAt,
        ],
      );
      return (r.rowCount ?? 0) > 0;
    }
    const dupe = [...this.rows.values()].some(
      (m) => m.activationId === msg.activationId,
    );
    if (dupe) return false;
    this.rows.set(msg.id, { ...msg, email: msg.email.toLowerCase() });
    return true;
  }

  async claimDue(
    owner: string,
    nowIso: string,
    leaseUntilIso: string,
    limit: number,
  ): Promise<DispatchRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE confirmation_dispatch SET
            status='sending', lease_owner=$1, lease_until=$2, updated_at=$3
          WHERE id IN (
            SELECT id FROM confirmation_dispatch
             WHERE status IN ('queued','failed') AND next_attempt_at <= $3
             ORDER BY next_attempt_at ASC
             LIMIT $4
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [owner, leaseUntilIso, nowIso, limit],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
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
   * Recover rows stuck in `sending` with an EXPIRED lease (a crashed worker).
   * We cannot prove whether the transport accepted them → `delivery_unknown`,
   * never a blind resend. Returns the recovered rows.
   */
  async recoverExpiredLeases(nowIso: string): Promise<DispatchRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE confirmation_dispatch
            SET status='delivery_unknown', reason='crash:ambiguous',
                lease_owner=NULL, lease_until=NULL, updated_at=$1
          WHERE status='sending' AND lease_until IS NOT NULL AND lease_until < $1
          RETURNING *`,
        [nowIso],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    const out: DispatchRecord[] = [];
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
        out.push({ ...m });
      }
    }
    return out;
  }

  async update(msg: DispatchRecord): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE confirmation_dispatch SET
            status=$2, attempts=$3, next_attempt_at=$4, lease_owner=$5,
            lease_until=$6, provider_id=$7, reason=$8, resolved_at=$9,
            updated_at=$10
          WHERE id=$1`,
        [
          msg.id, msg.status, msg.attempts, msg.nextAttemptAt, msg.leaseOwner,
          msg.leaseUntil, msg.providerId, msg.reason, msg.resolvedAt,
          msg.updatedAt,
        ],
      );
      return;
    }
    this.rows.set(msg.id, msg);
  }

  async get(id: string): Promise<DispatchRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM confirmation_dispatch WHERE id=$1",
        [id],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    const m = this.rows.get(id);
    return m ? { ...m } : undefined;
  }

  /** Owner/admin visibility: terminal / delivery_unknown for a tenant. */
  async listNeedsAttention(
    organizationId: string,
  ): Promise<DispatchRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM confirmation_dispatch
           WHERE organization_id=$1
             AND status IN ('terminal','delivery_unknown')
             AND resolved_at IS NULL
           ORDER BY updated_at DESC LIMIT 500`,
        [organizationId],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return [...this.rows.values()].filter(
      (m) =>
        m.organizationId === organizationId &&
        m.resolvedAt === null &&
        (m.status === "terminal" || m.status === "delivery_unknown"),
    );
  }
}

/**
 * The durable confirmation-send worker. Recovers crashed leases as
 * `delivery_unknown`, claims due rows under a lease, rechecks eligibility, sends
 * via the injected transactional `send`, and records honest terminal state.
 */
export class ConfirmationDispatchService {
  constructor(
    private readonly repo = new ConfirmationDispatchRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Enqueue a confirmation dispatch (idempotent per activation). */
  async enqueue(input: EnqueueDispatchInput): Promise<boolean> {
    const nowIso = new Date(this.now()).toISOString();
    return this.repo.enqueue({
      id: randomUUID(),
      organizationId: input.organizationId,
      activationId: input.activationId,
      email: input.email,
      consentRef: input.consentRef ?? null,
      consentVersion: input.consentVersion ?? null,
      confirmBase: input.confirmBase,
      status: "queued",
      attempts: 0,
      nextAttemptAt: input.runAt ?? nowIso,
      leaseOwner: null,
      leaseUntil: null,
      providerId: null,
      reason: null,
      resolvedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async needsAttention(organizationId: string): Promise<DispatchRecord[]> {
    return this.repo.listNeedsAttention(organizationId);
  }

  async runOnce(
    owner: string,
    deps: {
      eligibility: (m: DispatchRecord) => Promise<DispatchEligibility>;
      send: (m: DispatchRecord) => Promise<DispatchAttempt>;
      leaseMs?: number;
      limit?: number;
    },
  ): Promise<{ sent: number; skipped: number; failed: number; unknown: number }> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    // Crashed leases → delivery_unknown, never a blind resend.
    const recovered = await this.repo.recoverExpiredLeases(nowIso);
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
    let unknown = recovered.length;
    for (const m of claimed) {
      const elig = await deps.eligibility(m);
      if (!elig.eligible) {
        await this.repo.update({
          ...m,
          status: "skipped",
          reason: elig.reason.slice(0, 80),
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: new Date(this.now()).toISOString(),
        });
        skipped += 1;
        continue;
      }
      let attempt: DispatchAttempt;
      try {
        attempt = await deps.send(m);
      } catch (e) {
        // A THROW is ambiguous — we cannot tell if the transport accepted.
        attempt = {
          classification: "uncertain",
          reason: e instanceof Error ? e.message.slice(0, 80) : "send_error",
        };
      }
      const afterIso = new Date(this.now()).toISOString();
      if (attempt.classification === "accepted") {
        await this.repo.update({
          ...m,
          status: "sent",
          providerId: attempt.providerId ?? null,
          reason: "sent",
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: afterIso,
        });
        sent += 1;
      } else if (attempt.classification === "uncertain") {
        // Ambiguous acceptance → delivery_unknown, NEVER an automatic resend.
        await this.repo.update({
          ...m,
          status: "delivery_unknown",
          reason: (attempt.reason ?? "ambiguous").slice(0, 80),
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: afterIso,
        });
        unknown += 1;
      } else if (attempt.classification === "rejected") {
        // Permanent pre-acceptance rejection → terminal, no retry.
        await this.repo.update({
          ...m,
          status: "terminal",
          attempts: m.attempts + 1,
          reason: (attempt.reason ?? "rejected").slice(0, 80),
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: afterIso,
        });
        failed += 1;
      } else {
        // pre_acceptance_failure → retry with backoff (a retry mints a NEW token).
        const attempts = m.attempts + 1;
        const terminal = attempts >= MAX_ATTEMPTS;
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
        await this.repo.update({
          ...m,
          status: terminal ? "terminal" : "failed",
          attempts,
          reason: (attempt.reason ?? "pre_acceptance_failure").slice(0, 80),
          nextAttemptAt: new Date(this.now() + backoff).toISOString(),
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: afterIso,
        });
        failed += 1;
      }
    }
    return { sent, skipped, failed, unknown };
  }
}
