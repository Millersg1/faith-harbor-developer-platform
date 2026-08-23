/**
 * Durable delivery worker for the transactional domain-notice outbox
 * (credential-free lifecycle release). It claims queued/retry-due notices with a
 * lease, renders honest transactional copy, hands the message to the injected
 * transport, and records the outcome — appending an IMMUTABLE attempt row every
 * time. In this release the only wired transport is `CapturedNoticeSink`, so
 * NOTHING is actually sent; and the coordinator runs this worker in `full` mode
 * only (disabled by default).
 *
 * Outcome → status mapping (honest to what SMTP actually tells us):
 *  - accepted               → `accepted` (terminal). Acceptance for relay, NOT a
 *                             delivery guarantee; copy never claims "delivered".
 *  - rejected               → `rejected` (terminal, no retry).
 *  - pre_acceptance_failure → retry with capped exponential backoff; once the
 *                             bounded attempt budget is exhausted → `terminal`.
 *  - uncertain              → `delivery_unknown` (terminal HOLD). The message may
 *                             have been accepted, so it is NEVER blindly resent;
 *                             a human reconciles it.
 *
 * Safety / privacy:
 *  - claims are `FOR UPDATE SKIP LOCKED`; each notice is processed inside
 *    `runWithTenant(item.organizationId)`; a crashed `sending` lease is recovered
 *    to `queued` (re-evaluated, never blindly resent).
 *  - the persisted notice row + attempt history carry NO recipient address,
 *    subject, body, provider transcript, EPP code, contact, or payment data.
 *  - sender/recipient identity comes ONLY from the injected, trusted-context
 *    resolver; a notice with no resolvable recipient or no honest template is
 *    SKIPPED, not guessed at.
 */

import { runWithTenant } from "../../../tenancy/TenantContext";
import type { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import type { DomainNoticeRepository, DomainNoticeRow } from "./DomainNoticeRepository";
import { promisesForbiddenTiming, renderNoticeByType } from "./domainNoticeTemplates";
import type { NoticeTransport } from "./NoticeTransport";

/** Sender/recipient identity for one org, resolved from trusted context only. */
export interface NoticeRecipient {
  to: string;
  from: string;
}

export interface DomainNoticeWorkerDeps {
  repo: DomainNoticeRepository;
  registrations: DomainRegistrationRepository;
  transport: NoticeTransport;
  /** Resolves sender/recipient from trusted tenant context; null → SKIP. */
  recipient: (organizationId: string, registrationId: string) => Promise<NoticeRecipient | null>;
  now: () => string;
  newId: () => string;
  /** Max delivery attempts before a pre-acceptance failure becomes terminal. */
  maxAttempts?: number;
  /** Base backoff (ms) for retry scheduling; doubles per attempt up to the cap. */
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** Lease duration for an in-flight send (ms). */
  leaseMs?: number;
}

export interface DomainNoticeWorkerHealth {
  lastRunAt: string | null;
  lastClaimed: number;
  lastAccepted: number;
  lastRejected: number;
  lastDeferred: number;
  lastUnknown: number;
  lastTerminal: number;
  lastSkipped: number;
  lastRecovered: number;
}

export class DomainNoticeWorker {
  private lastRunAt: string | null = null;
  private c = { claimed: 0, accepted: 0, rejected: 0, deferred: 0, unknown: 0, terminal: 0, skipped: 0, recovered: 0 };

  constructor(private readonly d: DomainNoticeWorkerDeps) {}

  private maxAttempts() { return this.d.maxAttempts ?? 5; }

  async runOnce(owner: string): Promise<{ processed: number }> {
    const nowIso = this.d.now();
    this.lastRunAt = nowIso;
    this.c = { claimed: 0, accepted: 0, rejected: 0, deferred: 0, unknown: 0, terminal: 0, skipped: 0, recovered: 0 };
    this.c.recovered = await this.d.repo.recoverExpiredLease(nowIso); // crash recovery
    const leaseUntil = new Date(Date.parse(nowIso) + (this.d.leaseMs ?? 60_000)).toISOString();
    const claimed = await this.d.repo.claimDue(owner, nowIso, leaseUntil);
    this.c.claimed = claimed.length;
    for (const item of claimed) {
      await runWithTenant({ organizationId: item.organizationId }, () => this.processOne(item));
    }
    return { processed: claimed.length };
  }

  private async processOne(notice: DomainNoticeRow): Promise<void> {
    const nowIso = this.d.now();
    const reg = await this.d.registrations.get(notice.registrationId);
    // Registration gone / not active → nothing honest to send. Skip (terminal).
    if (!reg || reg.status !== "active") {
      return this.skip(notice, "registration_unavailable");
    }
    const rendered = renderNoticeByType(notice.noticeType, { domain: reg.asciiDomain });
    // No honest template for this type → skip rather than send an empty message.
    if (!rendered) return this.skip(notice, "no_template");
    // Defensive copy guard — our templates are honest, but never send timing promises.
    if (promisesForbiddenTiming(rendered.text)) return this.skip(notice, "copy_guard");
    // Recipient/sender come ONLY from trusted context. When delivery is not yet
    // configured (no recipient/transport), the notice is RE-QUEUED (kept alive),
    // not terminally skipped, so it flows once delivery is wired. No attempt is
    // counted for a config defer.
    const who = await this.d.recipient(notice.organizationId, notice.registrationId);
    if (!who) {
      this.c.deferred++;
      return this.d.repo.requeue({ noticeId: notice.id, nextAttemptAt: this.backoffAt(1, nowIso), now: nowIso });
    }

    let result;
    try {
      result = await this.d.transport.deliver({
        to: who.to, from: who.from, subject: rendered.subject, text: rendered.text,
        messageClass: "transactional", logicalId: `${notice.noticeType}:${notice.registrationId}`,
      });
    } catch {
      // The transport threw before returning any verdict — nothing was accepted.
      result = { classification: "pre_acceptance_failure" as const, reason: "transport_error" };
    }

    const attemptNo = notice.attempts + 1;
    const append = (classification: string, reason?: string) =>
      this.d.repo.appendAttempt({ id: this.d.newId(), noticeId: notice.id, registrationId: notice.registrationId, attemptNo, classification, reason, now: nowIso });

    switch (result.classification) {
      case "accepted":
        this.c.accepted++;
        await append("accepted", result.reason);
        return this.d.repo.settle({ noticeId: notice.id, status: "accepted", now: nowIso });
      case "rejected":
        this.c.rejected++;
        await append("rejected", result.reason);
        return this.d.repo.settle({ noticeId: notice.id, status: "rejected", now: nowIso });
      case "uncertain":
        // Ambiguous acceptance → HOLD as delivery_unknown; NEVER blindly resend.
        this.c.unknown++;
        await append("delivery_unknown", result.reason);
        return this.d.repo.settle({ noticeId: notice.id, status: "delivery_unknown", now: nowIso });
      case "pre_acceptance_failure":
      default: {
        await append("pre_acceptance_failure", result.reason);
        if (attemptNo >= this.maxAttempts()) {
          // Bounded retries exhausted — nothing was ever accepted → terminal fail.
          this.c.terminal++;
          return this.d.repo.settle({ noticeId: notice.id, status: "terminal", now: nowIso });
        }
        this.c.deferred++;
        return this.d.repo.settle({ noticeId: notice.id, status: "pre_acceptance_failure", nextAttemptAt: this.backoffAt(attemptNo, nowIso), now: nowIso });
      }
    }
  }

  private async skip(notice: DomainNoticeRow, reason: string): Promise<void> {
    this.c.skipped++;
    await this.d.repo.appendAttempt({ id: this.d.newId(), noticeId: notice.id, registrationId: notice.registrationId, attemptNo: notice.attempts + 1, classification: "skipped", reason, now: this.d.now() });
    await this.d.repo.settle({ noticeId: notice.id, status: "skipped", now: this.d.now() });
  }

  private backoffAt(attemptNo: number, nowIso: string): string {
    const base = this.d.backoffBaseMs ?? 15 * 60_000;
    const cap = this.d.backoffCapMs ?? 6 * 3_600_000;
    const delay = Math.min(cap, base * 2 ** (attemptNo - 1));
    return new Date(Date.parse(nowIso) + delay).toISOString();
  }

  health(): DomainNoticeWorkerHealth {
    return {
      lastRunAt: this.lastRunAt,
      lastClaimed: this.c.claimed,
      lastAccepted: this.c.accepted,
      lastRejected: this.c.rejected,
      lastDeferred: this.c.deferred,
      lastUnknown: this.c.unknown,
      lastTerminal: this.c.terminal,
      lastSkipped: this.c.skipped,
      lastRecovered: this.c.recovered,
    };
  }
}
