/**
 * Durable sequencing worker for the domain purchase saga. Mirrors the platform's
 * existing dispatch-worker shape: a single tick runs fulfillment → refund →
 * reconciliation (each an independent, idempotent, lease-claimed pass), with a
 * cooperative `beginShutdown()` and a PII-free heartbeat for health.
 *
 * Wiring this into a `setInterval` in the server is a deploy-integration step
 * (kept OFF while purchasing is disabled). The worker itself performs no live
 * Stripe or registrar mutation beyond what the saga already gates.
 */

import type { DomainPurchaseSaga } from "./DomainPurchaseSaga";

export interface DomainSagaWorkerHealth {
  running: boolean;
  lastTickAt: string | null;
  lastFulfilled: number;
  lastRefunded: number;
  lastReconciled: number;
}

export class DomainSagaWorker {
  private stopping = false;
  private lastTickAt: string | null = null;
  private lastFulfilled = 0;
  private lastRefunded = 0;
  private lastReconciled = 0;

  constructor(
    private readonly saga: DomainPurchaseSaga,
    private readonly owner = "platform",
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  beginShutdown(): void {
    this.stopping = true;
  }

  /** One full tick. Safe to call concurrently across workers (lease-guarded). */
  async runOnce(): Promise<void> {
    if (this.stopping) return;
    this.lastTickAt = this.now();
    // Each pass claims its own work with a short lease; a crash mid-pass leaves
    // an expired lease that the next tick recovers (registering -> unknown).
    this.lastFulfilled = (await this.saga.runFulfillmentOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastRefunded = (await this.saga.runRefundOnce(this.owner)).processed;
    if (this.stopping) return;
    this.lastReconciled = (await this.saga.runReconciliationOnce(this.owner)).processed;
  }

  /** PII-free health snapshot (counts + timestamps only). */
  health(): DomainSagaWorkerHealth {
    return {
      running: !this.stopping,
      lastTickAt: this.lastTickAt,
      lastFulfilled: this.lastFulfilled,
      lastRefunded: this.lastRefunded,
      lastReconciled: this.lastReconciled,
    };
  }
}
