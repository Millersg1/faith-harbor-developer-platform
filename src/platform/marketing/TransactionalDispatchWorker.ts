import type {
  ConfirmationDispatchService,
  DispatchAttempt,
  DispatchEligibility,
  DispatchRecord,
} from "./ConfirmationDispatchService";
import type {
  LeadMagnetDispatchService,
  MagnetDispatchRecord,
  MagnetSendAttempt,
} from "../magnet/LeadMagnetDispatchService";

/**
 * The TRANSACTIONAL dispatch worker. It drives fulfillment-of-request email that
 * is NOT marketing:
 *   - double-opt-in CONFIRMATION dispatch;
 *   - lead-magnet download-link dispatch.
 *
 * It runs INDEPENDENTLY of `MARKETING_DELIVERY_MODE`. It is deliberately separate
 * from the marketing worker so that pausing/disabling MARKETING can never stop
 * transactional mail. There is no "outbox marketing enabled" condition here.
 *
 * Both underlying services own their durable state, crash recovery
 * (`delivery_unknown`, never blind-resent), bounded retry, and single-metering.
 * This worker only sequences them and reports PII-free health.
 */
export interface TransactionalHealth {
  confirmation: { sent: number; skipped: number; failed: number; unknown: number };
  magnet: { sent: number; failed: number; unknown: number };
}

function zero(): TransactionalHealth {
  return {
    confirmation: { sent: 0, skipped: 0, failed: 0, unknown: 0 },
    magnet: { sent: 0, failed: 0, unknown: 0 },
  };
}

export interface TransactionalDispatchWorkerDeps {
  confirmation?: {
    service: ConfirmationDispatchService;
    eligibility: (m: DispatchRecord) => Promise<DispatchEligibility>;
    send: (m: DispatchRecord) => Promise<DispatchAttempt>;
  };
  magnet?: {
    service: LeadMagnetDispatchService;
    send: (m: MagnetDispatchRecord) => Promise<MagnetSendAttempt>;
  };
  leaseMs?: number;
  limit?: number;
}

export class TransactionalDispatchWorker {
  private stopping = false;

  constructor(private readonly deps: TransactionalDispatchWorkerDeps) {}

  beginShutdown(): void {
    this.stopping = true;
  }

  isStopping(): boolean {
    return this.stopping;
  }

  async runOnce(owner: string): Promise<TransactionalHealth> {
    const health = zero();
    if (this.stopping) return health; // claim no new work during shutdown

    if (this.deps.confirmation) {
      const c = await this.deps.confirmation.service.runOnce(owner, {
        eligibility: this.deps.confirmation.eligibility,
        send: this.deps.confirmation.send,
        leaseMs: this.deps.leaseMs,
        limit: this.deps.limit,
      });
      health.confirmation = { sent: c.sent, skipped: c.skipped, failed: c.failed, unknown: c.unknown };
    }
    if (this.deps.magnet) {
      const m = await this.deps.magnet.service.runOnce(owner, {
        send: this.deps.magnet.send,
        leaseMs: this.deps.leaseMs,
        limit: this.deps.limit,
      });
      health.magnet = { sent: m.sent, failed: m.failed, unknown: m.unknown };
    }
    return health;
  }
}
