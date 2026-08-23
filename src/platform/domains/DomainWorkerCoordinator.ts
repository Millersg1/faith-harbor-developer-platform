/**
 * Coordinates the domain background workers under one fail-closed operations
 * mode. It is instantiated only by the running server (never in tests — tests
 * call `runTick()` directly), and a single tick does mode-appropriate work:
 *
 *  - `disabled`       — nothing runs.
 *  - `reconcile_only` — ONLY read-only reconciliation: expired mutation leases
 *    are recovered to `*_unknown` and the provider is polled read-only to resolve
 *    unknowns. No submission and no Stripe refund is issued.
 *  - `full`           — every pass (fulfilment/submit/poll, refund, reconcile).
 *
 * Every globally-claimed item is processed inside `runWithTenant(item.org)` by
 * the sagas themselves; expired mutation leases become `*_unknown` and are never
 * blindly resubmitted. `health()` returns ONLY modes, counts, timestamps, a
 * derived tick-age, and a coarse reason enum — never a domain, contact, EPP code,
 * key, or payment reference.
 */

import type { DomainOperationsMode } from "./domainOperationsMode";
import type { DomainRuntime } from "./domainIntegration";
import type { DomainPurchaseSaga } from "./saga/DomainPurchaseSaga";
import type { DomainRenewalSaga } from "./renewal/DomainRenewalSaga";
import type { DomainTransferSaga } from "./transfer/DomainTransferSaga";
import { DomainRenewalWorker } from "./renewal/DomainRenewalWorker";
import { DomainSagaWorker } from "./saga/DomainSagaWorker";
import { DomainTransferWorker } from "./transfer/DomainTransferWorker";

export interface DomainWorkerHealth {
  mode: DomainOperationsMode;
  running: boolean;
  lastTickAt: string | null;
  lastTickAgeSeconds: number | null;
  ticks: number;
  counts: {
    fulfilled: number;
    renewed: number;
    transfersSubmitted: number;
    transfersPolled: number;
    refunded: number;
    reconciled: number;
    autoRenewScanned: number;
    lifecycleScanned: number;
    syncScanned: number;
    noticesProcessed: number;
  };
  lastReason: "ok" | "tick_error" | "never_run";
}

export class DomainWorkerCoordinator {
  private stopping = false;
  private lastTickAt: string | null = null;
  private ticks = 0;
  private lastReason: DomainWorkerHealth["lastReason"] = "never_run";
  private readonly counts: DomainWorkerHealth["counts"] = {
    fulfilled: 0, renewed: 0, transfersSubmitted: 0, transfersPolled: 0, refunded: 0, reconciled: 0, autoRenewScanned: 0, lifecycleScanned: 0, syncScanned: 0, noticesProcessed: 0,
  };
  private readonly sagaWorker: DomainSagaWorker;
  private readonly renewalWorker: DomainRenewalWorker;
  private readonly transferWorker: DomainTransferWorker;

  constructor(
    private readonly runtime: Pick<DomainRuntime, "purchase" | "renewal" | "transfer" | "autoRenewScheduler" | "lifecycleScanner" | "noticeWorker" | "syncScanner">,
    private readonly mode: DomainOperationsMode,
    private readonly owner = "platform",
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.sagaWorker = new DomainSagaWorker(runtime.purchase, owner, now);
    this.renewalWorker = new DomainRenewalWorker(runtime.renewal, owner, now);
    this.transferWorker = new DomainTransferWorker(runtime.transfer, owner, now);
  }

  beginShutdown(): void {
    this.stopping = true;
    this.sagaWorker.beginShutdown();
    this.renewalWorker.beginShutdown();
    this.transferWorker.beginShutdown();
  }

  /** One coordinated tick. Safe across processes (lease-guarded in the repos). */
  async runTick(): Promise<void> {
    if (this.stopping || this.mode === "disabled") return;
    this.lastTickAt = this.now();
    this.ticks++;
    try {
      if (this.mode === "reconcile_only") {
        // Read-only provider work + expired-lease recovery only. No submission,
        // no Stripe refund issuance.
        this.counts.reconciled += (await this.runtime.purchase.runReconciliationOnce(this.owner)).processed;
        if (this.stopping) return;
        this.counts.reconciled += (await this.runtime.renewal.runRenewalReconcileOnce(this.owner)).processed;
        if (this.stopping) return;
        this.counts.reconciled += (await this.runtime.transfer.runReconcileOnce(this.owner)).processed;
        if (this.stopping) return;
        await this.runReadOnlyScanners();
      } else {
        // full: every pass via the sequencer workers.
        await this.sagaWorker.runOnce();
        if (this.stopping) return;
        await this.renewalWorker.runOnce();
        if (this.stopping) return;
        await this.transferWorker.runOnce();
        const s = this.sagaWorker.health();
        const r = this.renewalWorker.health();
        const t = this.transferWorker.health();
        this.counts.fulfilled += s.lastFulfilled;
        this.counts.renewed += r.lastRenewed;
        this.counts.transfersSubmitted += t.lastSubmitted;
        this.counts.transfersPolled += t.lastPolled;
        this.counts.refunded += s.lastRefunded + r.lastRefunded + t.lastRefunded;
        this.counts.reconciled += s.lastReconciled + r.lastReconciled + t.lastReconciled;
        // Read-only scanners run in both modes.
        if (this.stopping) return;
        await this.runReadOnlyScanners();
        // Lifecycle scanners that may create charges run in `full` only.
        if (this.stopping) return;
        if (this.runtime.autoRenewScheduler) {
          this.counts.autoRenewScanned += (await this.runtime.autoRenewScheduler.runOnce(this.owner)).processed;
        }
        // Notice delivery (captured transport only — sends no real email).
        if (this.stopping) return;
        if (this.runtime.noticeWorker) {
          this.counts.noticesProcessed += (await this.runtime.noticeWorker.runOnce(this.owner)).processed;
        }
      }
      this.lastReason = "ok";
    } catch {
      // A tick error is recorded coarsely; the next tick retries (lease-guarded).
      this.lastReason = "tick_error";
    }
  }

  /** Read-only scanners (lifecycle, sync) — safe in reconcile_only + full. */
  private async runReadOnlyScanners(): Promise<void> {
    if (this.runtime.syncScanner) {
      this.counts.syncScanned += (await this.runtime.syncScanner.runOnce(this.owner)).processed;
    }
    if (this.stopping) return;
    if (this.runtime.lifecycleScanner) {
      this.counts.lifecycleScanned += (await this.runtime.lifecycleScanner.runOnce(this.owner)).processed;
    }
  }

  health(): DomainWorkerHealth {
    const ageSeconds = this.lastTickAt
      ? Math.max(0, Math.floor((Date.parse(this.now()) - Date.parse(this.lastTickAt)) / 1000))
      : null;
    return {
      mode: this.mode,
      running: !this.stopping && this.mode !== "disabled",
      lastTickAt: this.lastTickAt,
      lastTickAgeSeconds: ageSeconds,
      ticks: this.ticks,
      counts: { ...this.counts },
      lastReason: this.lastReason,
    };
  }
}
