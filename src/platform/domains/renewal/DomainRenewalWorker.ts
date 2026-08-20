/**
 * Durable sequencing worker for the domain RENEWAL saga. One tick runs
 * renewal → refund → reconciliation (each an independent, idempotent,
 * lease-claimed, tenant-re-entrant pass), with a cooperative shutdown and a
 * PII-free heartbeat. Scheduling this on an interval is a Stage 11 step (kept
 * OFF while purchasing/renewals are disabled).
 */

import type { DomainRenewalSaga } from "./DomainRenewalSaga";

export interface DomainRenewalWorkerHealth {
  running: boolean;
  lastTickAt: string | null;
  lastRenewed: number;
  lastRefunded: number;
  lastReconciled: number;
}

export class DomainRenewalWorker {
  private stopping = false;
  private lastTickAt: string | null = null;
  private lastRenewed = 0;
  private lastRefunded = 0;
  private lastReconciled = 0;

  constructor(
    private readonly saga: DomainRenewalSaga,
    private readonly owner = "platform",
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  beginShutdown(): void {
    this.stopping = true;
  }

  async runOnce(): Promise<void> {
    if (this.stopping) return;
    this.lastTickAt = this.now();
    this.lastRenewed = (await this.saga.runRenewalOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastRefunded = (await this.saga.runRenewalRefundOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastReconciled = (await this.saga.runRenewalReconcileOnce(this.owner)).processed;
  }

  health(): DomainRenewalWorkerHealth {
    return {
      running: !this.stopping,
      lastTickAt: this.lastTickAt,
      lastRenewed: this.lastRenewed,
      lastRefunded: this.lastRefunded,
      lastReconciled: this.lastReconciled,
    };
  }
}
