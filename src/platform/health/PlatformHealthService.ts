import type { DomainWorkerHealth } from "../domains/DomainWorkerCoordinator";

/**
 * A point-in-time health snapshot of the platform, for the superadmin console.
 * Every field is a real, checked signal — nothing is assumed "ok".
 */
export interface SystemHealth {
  /** Database reachability (a trivial query succeeded). */
  db: "ok" | "error";
  /** Outbound email transport (SMTP configured + connected). */
  email: { connected: boolean };
  /** Whether the platform's included AI key is configured. */
  ai: { platformKey: boolean };
  /** Whether Stripe billing is connected (live charges possible). */
  stripe: { connected: boolean };
  /** The drip/workflow background tick worker. */
  worker: {
    running: boolean;
    lastTickAt: string | null;
    intervalMs: number;
  };
  /**
   * The TRANSACTIONAL dispatch worker (double-opt-in confirmation + lead-magnet
   * email). Reported SEPARATELY from the marketing mode so operators can see
   * transactional mail is processing even when marketing is disabled. No secrets.
   */
  transactionalWorker: {
    running: boolean;
    lastTickAt: string | null;
  };
  /**
   * The single authoritative marketing delivery mode (disabled|legacy|outbox),
   * so operators can confirm exactly one path is live. No secrets.
   */
  marketingDeliveryMode: "disabled" | "legacy" | "outbox";
  /**
   * Domain-registration workers (Stage 11). Null when no domain runtime is
   * configured or the mode is disabled. PII-free: modes, counts, timestamps,
   * derived tick-age, coarse reason enum only.
   */
  domainWorkers?: DomainWorkerHealth | null;
  startedAt: string;
  uptimeSeconds: number;
  version: string;
}

export interface HealthChecks {
  /** Runs a trivial DB query; resolves true when the database answers. */
  pingDb: () => Promise<boolean>;
  emailConnected: boolean;
  aiPlatformKey: boolean;
  stripeConnected: boolean;
  /** The last background-worker tick time (ISO), or null if it hasn't ticked. */
  workerLastTickAt: () => string | null;
  workerIntervalMs: number;
  /** The last TRANSACTIONAL-worker tick time (ISO), or null. */
  transactionalLastTickAt: () => string | null;
  /** The active marketing delivery mode (read at snapshot time). */
  marketingDeliveryMode: () => "disabled" | "legacy" | "outbox";
  /** Domain-worker health (read at snapshot time), or null when not configured. */
  domainWorkers?: () => DomainWorkerHealth | null;
  startedAt: string;
  version: string;
  now?: () => number;
}

/**
 * Assembles a {@link SystemHealth} snapshot from injected checks. Kept free of
 * concrete dependencies so it's trivially testable; the server wires the real
 * database ping, connectivity flags, and worker heartbeat.
 */
export class PlatformHealthService {
  private readonly now: () => number;

  constructor(
    private readonly checks: HealthChecks,
  ) {
    this.now =
      checks.now ?? (() => Date.now());
  }

  async snapshot(): Promise<SystemHealth> {
    let db: "ok" | "error" = "error";
    try {
      db = (await this.checks.pingDb())
        ? "ok"
        : "error";
    } catch {
      db = "error";
    }

    const lastTickAt =
      this.checks.workerLastTickAt();
    // "Running" if it ticked within the last few intervals.
    const running = lastTickAt
      ? this.now() -
          Date.parse(lastTickAt) <
        this.checks.workerIntervalMs * 3
      : false;

    const startedMs = Date.parse(
      this.checks.startedAt,
    );

    return {
      db,
      email: {
        connected:
          this.checks.emailConnected,
      },
      ai: {
        platformKey:
          this.checks.aiPlatformKey,
      },
      stripe: {
        connected:
          this.checks.stripeConnected,
      },
      worker: {
        running,
        lastTickAt,
        intervalMs:
          this.checks.workerIntervalMs,
      },
      transactionalWorker: {
        lastTickAt: this.checks.transactionalLastTickAt(),
        running: (() => {
          const t = this.checks.transactionalLastTickAt();
          return t
            ? this.now() - Date.parse(t) <
                this.checks.workerIntervalMs * 3
            : false;
        })(),
      },
      marketingDeliveryMode:
        this.checks.marketingDeliveryMode(),
      domainWorkers:
        this.checks.domainWorkers?.() ?? null,
      startedAt:
        this.checks.startedAt,
      uptimeSeconds: Number.isFinite(
        startedMs,
      )
        ? Math.max(
            0,
            Math.floor(
              (this.now() -
                startedMs) /
                1000,
            ),
          )
        : 0,
      version: this.checks.version,
    };
  }
}
