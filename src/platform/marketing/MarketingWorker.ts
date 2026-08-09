import type {
  MarketingOutboxRepository,
  OutboxMessage,
} from "./MarketingOutboxService";
import type {
  ConfirmationDispatchService,
  DispatchAttempt,
  DispatchEligibility,
  DispatchRecord,
} from "./ConfirmationDispatchService";
import type { MarketingLimitsService } from "./MarketingLimitsService";
import type { MarketingPauseService } from "./MarketingPauseService";
import type { MarketingDeliveryMode } from "./marketingDeliveryMode";

/**
 * The durable marketing worker: priority-ordered, fair, rate-limited, and
 * crash/restart-safe. It NEVER lets marketing volume, pause, throttling, or
 * failure affect transactional email.
 *
 * Priority per cycle:
 *  1. Transactional confirmation dispatch (double-opt-in) — always runs, never
 *     gated by marketing pause/limits/auto-pause.
 *  2. (reserved for future durable transactional work)
 *  3. Marketing outbox — gated by tenant/sequence pause, durable hourly/daily +
 *     concurrency limits, per-tenant fairness, and a final send-time eligibility
 *     recheck.
 *
 * Honesty: `sent` (SMTP acceptance) is the SINGLE marketing-metering point,
 * counted once. Ambiguous/crashed attempts become `delivery_unknown` and are
 * NEVER auto-resent. A rate-limit / pause / paused-sequence DEFERS a message
 * (lease released, retried later) — it is not a failure and never increments
 * the attempt counter or meters a send.
 */

/** Pre-send decision for one marketing message (final eligibility). */
export type MarketingSendDecision =
  | { kind: "send" }
  /** Try again later (tenant/sequence paused, rate cap) — not a failure. */
  | { kind: "defer"; reason: string }
  /** Durable, specific non-retry outcomes. */
  | { kind: "skip"; reason: string }
  | { kind: "needs_attention"; reason: string }
  | { kind: "terminal"; reason: string };

/** Honest transport result for one marketing send. */
export type MarketingSendResult =
  | { classification: "accepted"; providerId?: string; messageId?: string }
  | { classification: "uncertain"; reason?: string }
  | { classification: "rejected"; reason?: string }
  | { classification: "pre_acceptance_failure"; reason?: string };

export interface MarketingWorkerConfig {
  /** Max messages claimed per marketing cycle. */
  batchLimit: number;
  /** Max messages sent per tenant per cycle (fairness). */
  perTenantBatch: number;
  /** Lease duration for a claimed message. */
  leaseMs: number;
  /** How long to defer a rate-limited/paused message before re-claiming. */
  deferMs: number;
  /** Confirmation-dispatch batch size (transactional priority). */
  confirmationLimit: number;
}

export const DEFAULT_WORKER_CONFIG: MarketingWorkerConfig = {
  batchLimit: 50,
  perTenantBatch: 5,
  leaseMs: 60_000,
  deferMs: 60_000,
  confirmationLimit: 25,
};

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5 * 60 * 1000;

export interface MarketingWorkerHealth {
  confirmation: { sent: number; failed: number; skipped: number; unknown: number };
  marketing: {
    sent: number;
    deferred: number;
    skipped: number;
    needsAttention: number;
    terminal: number;
    failed: number;
    unknown: number;
    recovered: number;
    autoPaused: number;
  };
}

function zeroHealth(): MarketingWorkerHealth {
  return {
    confirmation: { sent: 0, failed: 0, skipped: 0, unknown: 0 },
    marketing: {
      sent: 0,
      deferred: 0,
      skipped: 0,
      needsAttention: 0,
      terminal: 0,
      failed: 0,
      unknown: 0,
      recovered: 0,
      autoPaused: 0,
    },
  };
}

export interface MarketingWorkerDeps {
  outbox: MarketingOutboxRepository;
  limits: MarketingLimitsService;
  pause: MarketingPauseService;
  /** Transactional confirmation dispatch (priority 1). Optional. */
  confirmation?: {
    service: ConfirmationDispatchService;
    eligibility: (m: DispatchRecord) => Promise<DispatchEligibility>;
    send: (m: DispatchRecord) => Promise<DispatchAttempt>;
  };
  /** Final send-time eligibility for a marketing message (tenant-scoped inside). */
  eligibility: (m: OutboxMessage) => Promise<MarketingSendDecision>;
  /** The marketing send (resolves sender at send time; adds unsubscribe headers). */
  send: (m: OutboxMessage) => Promise<MarketingSendResult>;
  /**
   * Authoritative delivery mode. Marketing outbox claims run ONLY in `outbox`
   * mode; in `legacy`/`disabled` the worker still runs transactional
   * confirmation dispatch but refuses to claim/send marketing. Defaults to
   * `outbox` when unset (unit tests exercise the marketing path directly).
   */
  mode?: () => MarketingDeliveryMode;
  now?: () => number;
  config?: Partial<MarketingWorkerConfig>;
}

export class MarketingWorker {
  private readonly outbox: MarketingOutboxRepository;
  private readonly limits: MarketingLimitsService;
  private readonly pause: MarketingPauseService;
  private readonly confirmation?: MarketingWorkerDeps["confirmation"];
  private readonly eligibility: MarketingWorkerDeps["eligibility"];
  private readonly send: MarketingWorkerDeps["send"];
  private readonly mode: () => MarketingDeliveryMode;
  private readonly now: () => number;
  private readonly config: MarketingWorkerConfig;
  private stopping = false;

  constructor(deps: MarketingWorkerDeps) {
    this.outbox = deps.outbox;
    this.limits = deps.limits;
    this.pause = deps.pause;
    this.confirmation = deps.confirmation;
    this.eligibility = deps.eligibility;
    this.send = deps.send;
    this.mode = deps.mode ?? (() => "outbox");
    this.now = deps.now ?? (() => Date.now());
    this.config = { ...DEFAULT_WORKER_CONFIG, ...deps.config };
  }

  /** Begin graceful shutdown: stop claiming NEW work. In-flight completes. */
  beginShutdown(): void {
    this.stopping = true;
  }

  isStopping(): boolean {
    return this.stopping;
  }

  async runOnce(owner: string): Promise<MarketingWorkerHealth> {
    const health = zeroHealth();
    if (this.stopping) return health; // claim no new work during shutdown

    // ---- Priority 1: transactional confirmation dispatch ----
    // Runs unconditionally — marketing pause/limits/auto-pause never touch it.
    if (this.confirmation) {
      const c = await this.confirmation.service.runOnce(owner, {
        eligibility: this.confirmation.eligibility,
        send: this.confirmation.send,
        limit: this.config.confirmationLimit,
        leaseMs: this.config.leaseMs,
      });
      health.confirmation = {
        sent: c.sent,
        failed: c.failed,
        skipped: c.skipped,
        unknown: c.unknown,
      };
    }

    // ---- Priority 3: marketing outbox ----
    // Only in `outbox` mode. In `legacy`/`disabled` the worker refuses to claim
    // or send marketing (the legacy drip path owns marketing in `legacy`, and
    // nothing sends it in `disabled`) — so the two paths never both deliver.
    if (this.mode() === "outbox") {
      await this.processMarketing(owner, health);
    }
    return health;
  }

  private async processMarketing(
    owner: string,
    health: MarketingWorkerHealth,
  ): Promise<void> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();

    // Crashed leases → delivery_unknown (never blind-resent). Each ambiguous
    // outcome is an observable signal for auto-pause.
    const recovered = await this.outbox.recoverExpiredLeases(nowIso);
    health.marketing.recovered = recovered.length;
    for (const r of recovered) {
      await this.limits.recordUnknown(r.organizationId);
    }

    // Concurrency baseline = work already in-flight from OTHER workers/cycles,
    // measured BEFORE we claim (our own claim would otherwise self-saturate the
    // limit). Fair per-tenant distribution is handled by SKIP-LOCKED leasing +
    // the per-tenant cap below; the concurrency caps guard multi-worker fan-out.
    const platformSending = await this.outbox.countSending(null);
    const leaseUntil = new Date(nowMs + this.config.leaseMs).toISOString();
    const claimed = await this.outbox.claimDue(
      owner,
      nowIso,
      leaseUntil,
      this.config.batchLimit,
    );

    // Group by tenant for fair scheduling; cap sends per tenant per cycle.
    const byTenant = new Map<string, OutboxMessage[]>();
    for (const m of claimed) {
      const list = byTenant.get(m.organizationId) ?? [];
      list.push(m);
      byTenant.set(m.organizationId, list);
    }

    const touched = new Set<string>();
    for (const [org, messages] of byTenant) {
      touched.add(org);
      const tenantPaused = await this.pause.isTenantPaused(org);
      // Tenant baseline excludes the rows WE just claimed this cycle.
      const tenantSending = Math.max(
        0,
        (await this.outbox.countSending(org)) - messages.length,
      );
      let tenantSentThisCycle = 0;

      for (const m of messages) {
        // Fairness: cap sends per tenant per cycle; defer the rest.
        if (tenantSentThisCycle >= this.config.perTenantBatch) {
          await this.defer(m, "fairness_cap");
          health.marketing.deferred += 1;
          continue;
        }
        // Tenant marketing pause → defer (resume later); transactional is
        // unaffected (handled above).
        if (tenantPaused) {
          await this.defer(m, "tenant_paused");
          health.marketing.deferred += 1;
          continue;
        }
        // Sequence pause → defer.
        if (m.sequenceId && (await this.pause.isSequencePaused(org, m.sequenceId))) {
          await this.defer(m, "sequence_paused");
          health.marketing.deferred += 1;
          continue;
        }
        // Durable, restart-safe rate + concurrency caps → defer.
        const gate = await this.limits.checkSendAllowed(org, {
          tenantSending,
          platformSending,
        });
        if (!gate.allowed) {
          await this.defer(m, gate.reason);
          health.marketing.deferred += 1;
          continue;
        }
        // FINAL send-time eligibility recheck (consent/suppression/lead/
        // enrollment/sequence/ownership/sender/identity). A failure is a
        // SPECIFIC durable state, never an endless retry.
        const decision = await this.eligibility(m);
        if (decision.kind !== "send") {
          await this.applyDecision(m, decision, health);
          continue;
        }
        // Send. Attempts are counted separately from confirmed sends so a run
        // of failures can't create an unlimited retry storm.
        await this.limits.recordAttempt(org);
        let result: MarketingSendResult;
        try {
          result = await this.send(m);
        } catch (e) {
          result = {
            classification: "uncertain",
            reason: e instanceof Error ? e.message.slice(0, 80) : "send_error",
          };
        }
        await this.recordResult(m, result, health);
        if (result.classification === "accepted") {
          // Single marketing-metering point.
          await this.limits.recordSent(org);
          tenantSentThisCycle += 1;
        } else if (result.classification === "uncertain") {
          await this.limits.recordUnknown(org);
        } else {
          await this.limits.recordFailure(org);
        }
      }
    }

    // Failure-rate auto-pause (observable evidence + minimum sample). Pauses
    // MARKETING only — transactional dispatch is never affected.
    for (const org of touched) {
      const decision = await this.limits.evaluateAutoPause(org);
      if (decision.pause && !(await this.pause.isTenantPaused(org))) {
        await this.pause.pauseTenant(org, {
          actor: "system",
          auto: true,
          reason: decision.reason,
          threshold: decision.threshold,
          recovery: "manual_resume_required",
        });
        health.marketing.autoPaused += 1;
      }
    }
  }

  /** Release the lease and retry later (not a failure; no attempt/meter). */
  private async defer(m: OutboxMessage, reason: string): Promise<void> {
    await this.outbox.update({
      ...m,
      status: "queued",
      leaseOwner: null,
      leaseUntil: null,
      reason: reason.slice(0, 80),
      nextAttemptAt: new Date(this.now() + this.config.deferMs).toISOString(),
      updatedAt: new Date(this.now()).toISOString(),
    });
  }

  private async applyDecision(
    m: OutboxMessage,
    decision: Exclude<MarketingSendDecision, { kind: "send" }>,
    health: MarketingWorkerHealth,
  ): Promise<void> {
    const nowIso = new Date(this.now()).toISOString();
    if (decision.kind === "defer") {
      await this.defer(m, decision.reason);
      health.marketing.deferred += 1;
      return;
    }
    // skip → skipped; needs_attention → surfaced via the outbox's
    // needs-attention set (terminal/delivery_unknown with resolved_at NULL);
    // terminal → terminal. All are specific, durable, non-retry states.
    const status: OutboxMessage["status"] =
      decision.kind === "skip" ? "skipped" : "terminal";
    await this.outbox.update({
      ...m,
      status,
      reason: `${decision.kind}:${decision.reason}`.slice(0, 80),
      leaseOwner: null,
      leaseUntil: null,
      resolvedAt: null,
      updatedAt: nowIso,
    });
    if (decision.kind === "skip") health.marketing.skipped += 1;
    else if (decision.kind === "needs_attention") health.marketing.needsAttention += 1;
    else health.marketing.terminal += 1;
  }

  private async recordResult(
    m: OutboxMessage,
    result: MarketingSendResult,
    health: MarketingWorkerHealth,
  ): Promise<void> {
    const nowIso = new Date(this.now()).toISOString();
    if (result.classification === "accepted") {
      await this.outbox.update({
        ...m,
        status: "sent",
        providerId: result.providerId ?? null,
        messageIdHeader: result.messageId ?? null,
        reason: "sent",
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: nowIso,
      });
      health.marketing.sent += 1;
      return;
    }
    if (result.classification === "uncertain") {
      // Ambiguous — delivery_unknown, NEVER auto-resent.
      await this.outbox.update({
        ...m,
        status: "delivery_unknown",
        reason: (result.reason ?? "ambiguous").slice(0, 80),
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: nowIso,
      });
      health.marketing.unknown += 1;
      return;
    }
    if (result.classification === "rejected") {
      await this.outbox.update({
        ...m,
        status: "terminal",
        attempts: m.attempts + 1,
        reason: (result.reason ?? "rejected").slice(0, 80),
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: nowIso,
      });
      health.marketing.terminal += 1;
      return;
    }
    // pre_acceptance_failure → bounded retry with backoff.
    const attempts = m.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
    await this.outbox.update({
      ...m,
      status: terminal ? "terminal" : "failed",
      attempts,
      reason: (result.reason ?? "pre_acceptance_failure").slice(0, 80),
      nextAttemptAt: new Date(this.now() + backoff).toISOString(),
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: nowIso,
    });
    if (terminal) health.marketing.terminal += 1;
    else health.marketing.failed += 1;
  }
}
