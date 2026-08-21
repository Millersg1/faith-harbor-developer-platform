/**
 * Durable sequencing worker for the INCOMING-transfer saga. One tick runs
 * submit → poll → refund → reconcile (each idempotent, lease-claimed, and
 * tenant-re-entrant). Scheduling is a Stage 11 step (kept OFF while transfers
 * are disabled). PII-free heartbeat.
 */

import type { DomainTransferSaga } from "./DomainTransferSaga";

export interface DomainTransferWorkerHealth {
  running: boolean;
  lastTickAt: string | null;
  lastSubmitted: number;
  lastPolled: number;
  lastRefunded: number;
  lastReconciled: number;
}

export class DomainTransferWorker {
  private stopping = false;
  private lastTickAt: string | null = null;
  private lastSubmitted = 0;
  private lastPolled = 0;
  private lastRefunded = 0;
  private lastReconciled = 0;

  constructor(
    private readonly saga: DomainTransferSaga,
    private readonly owner = "platform",
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  beginShutdown(): void {
    this.stopping = true;
  }

  async runOnce(): Promise<void> {
    if (this.stopping) return;
    this.lastTickAt = this.now();
    this.lastSubmitted = (await this.saga.runSubmitOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastPolled = (await this.saga.runPollOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastRefunded = (await this.saga.runRefundOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastReconciled = (await this.saga.runReconcileOnce(this.owner)).processed;
  }

  health(): DomainTransferWorkerHealth {
    return {
      running: !this.stopping,
      lastTickAt: this.lastTickAt,
      lastSubmitted: this.lastSubmitted,
      lastPolled: this.lastPolled,
      lastRefunded: this.lastRefunded,
      lastReconciled: this.lastReconciled,
    };
  }
}
