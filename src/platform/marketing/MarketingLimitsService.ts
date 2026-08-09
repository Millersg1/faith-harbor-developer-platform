import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * Durable, restart-safe marketing send limits + failure metering.
 *
 * The counters live in `marketing_send_meter` (not memory), so hourly/daily caps
 * and failure-rate signals survive a process restart. Two things are counted
 * SEPARATELY and must never be conflated:
 *  - `sent`   — the marketing-metering point: a confirmed SMTP acceptance,
 *               counted EXACTLY ONCE per message. Caps are enforced on this.
 *  - `attempt`/`failure`/`unknown` — observable transport outcomes used only for
 *               storm-protection and failure-rate auto-pause. They NEVER meter a
 *               send and NEVER gate marketing metering.
 *
 * The default caps are CONSERVATIVE and CONFIGURABLE placeholders — NOT a
 * measured production capacity claim. They are to be compared read-only against
 * the server's real Exim/cPanel limits during the deliverability/acceptance
 * stage before any production use.
 */
export interface MarketingLimitsConfig {
  perTenantHourly: number;
  perTenantDaily: number;
  platformHourly: number;
  platformDaily: number;
  perTenantConcurrent: number;
  platformConcurrent: number;
  /** Bounded retry per message (matches the outbox's MAX_ATTEMPTS). */
  maxAttempts: number;
  /** Minimum observed attempts before a percentage-based auto-pause can fire. */
  autoPauseMinSample: number;
  /** Observed (failure+unknown)/attempts ratio that trips marketing auto-pause. */
  autoPauseFailureRate: number;
}

export const DEFAULT_MARKETING_LIMITS: MarketingLimitsConfig = {
  perTenantHourly: 100,
  perTenantDaily: 500,
  platformHourly: 500,
  platformDaily: 2000,
  perTenantConcurrent: 2,
  platformConcurrent: 6,
  maxAttempts: 5,
  autoPauseMinSample: 20,
  autoPauseFailureRate: 0.5,
};

export type WindowKind = "hour" | "day";

const PLATFORM = "PLATFORM";

/** Deterministic window start (UTC) for a timestamp. */
export function windowStart(kind: WindowKind, atMs: number): string {
  const d = new Date(atMs);
  if (kind === "hour") {
    return `${d.toISOString().slice(0, 13)}:00:00.000Z`; // YYYY-MM-DDTHH
  }
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`; // YYYY-MM-DD
}

interface MeterRow {
  sent_count: number;
  attempt_count: number;
  failure_count: number;
  unknown_count: number;
}

type Counter = "sent" | "attempt" | "failure" | "unknown";

export class MarketingMeterRepository {
  private readonly rows = new Map<string, MeterRow>();

  constructor(private readonly db?: PgQueryable) {}

  private key(scope: string, kind: WindowKind, start: string): string {
    return `${scope}|${kind}|${start}`;
  }

  /** Atomically add to one counter for a (scope, window). Upsert. */
  async increment(
    scope: string,
    kind: WindowKind,
    start: string,
    counter: Counter,
    by = 1,
  ): Promise<void> {
    const col = `${counter}_count`;
    if (this.db) {
      // Column name is from a fixed internal allowlist, never user input.
      await this.db.query(
        `INSERT INTO marketing_send_meter
           (scope_key, window_kind, window_start, ${col})
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (scope_key, window_kind, window_start)
         DO UPDATE SET ${col} = marketing_send_meter.${col} + $4`,
        [scope, kind, start, by],
      );
      return;
    }
    const k = this.key(scope, kind, start);
    const row =
      this.rows.get(k) ??
      { sent_count: 0, attempt_count: 0, failure_count: 0, unknown_count: 0 };
    row[`${counter}_count` as keyof MeterRow] += by;
    this.rows.set(k, row);
  }

  async read(
    scope: string,
    kind: WindowKind,
    start: string,
  ): Promise<MeterRow> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT sent_count, attempt_count, failure_count, unknown_count
           FROM marketing_send_meter
          WHERE scope_key=$1 AND window_kind=$2 AND window_start=$3`,
        [scope, kind, start],
      );
      const row = r.rows[0] as unknown as MeterRow | undefined;
      return (
        row ?? {
          sent_count: 0,
          attempt_count: 0,
          failure_count: 0,
          unknown_count: 0,
        }
      );
    }
    return (
      this.rows.get(this.key(scope, kind, start)) ?? {
        sent_count: 0,
        attempt_count: 0,
        failure_count: 0,
        unknown_count: 0,
      }
    );
  }
}

export type SendGateOutcome =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "tenant_hourly"
        | "tenant_daily"
        | "platform_hourly"
        | "platform_daily"
        | "tenant_concurrent"
        | "platform_concurrent";
    };

export class MarketingLimitsService {
  constructor(
    private readonly meter = new MarketingMeterRepository(),
    private readonly config: MarketingLimitsConfig = DEFAULT_MARKETING_LIMITS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  limits(): MarketingLimitsConfig {
    return this.config;
  }

  /** Record ONE confirmed SMTP-accepted marketing send (the metering point). */
  async recordSent(organizationId: string): Promise<void> {
    const at = this.now();
    for (const scope of [organizationId, PLATFORM]) {
      for (const kind of ["hour", "day"] as const) {
        await this.meter.increment(scope, kind, windowStart(kind, at), "sent");
      }
    }
  }

  /** Record an SMTP ATTEMPT (any outcome). Never meters a send. */
  async recordAttempt(organizationId: string): Promise<void> {
    const at = this.now();
    for (const scope of [organizationId, PLATFORM]) {
      for (const kind of ["hour", "day"] as const) {
        await this.meter.increment(scope, kind, windowStart(kind, at), "attempt");
      }
    }
  }

  /** Record an OBSERVABLE failure (connection/auth/tls/4xx/5xx/terminal). */
  async recordFailure(organizationId: string): Promise<void> {
    const at = this.now();
    for (const scope of [organizationId, PLATFORM]) {
      for (const kind of ["hour", "day"] as const) {
        await this.meter.increment(scope, kind, windowStart(kind, at), "failure");
      }
    }
  }

  /** Record an ambiguous delivery-unknown outcome (observable, not a bounce). */
  async recordUnknown(organizationId: string): Promise<void> {
    const at = this.now();
    for (const scope of [organizationId, PLATFORM]) {
      for (const kind of ["hour", "day"] as const) {
        await this.meter.increment(scope, kind, windowStart(kind, at), "unknown");
      }
    }
  }

  /**
   * Check hourly + daily send caps for the tenant AND the platform against the
   * durable, current-window `sent` counts. Concurrency is checked separately by
   * the worker from leased-row counts (passed in).
   */
  async checkSendAllowed(
    organizationId: string,
    concurrency: { tenantSending: number; platformSending: number },
  ): Promise<SendGateOutcome> {
    const at = this.now();
    const c = this.config;
    const tHour = await this.meter.read(organizationId, "hour", windowStart("hour", at));
    if (tHour.sent_count >= c.perTenantHourly) {
      return { allowed: false, reason: "tenant_hourly" };
    }
    const tDay = await this.meter.read(organizationId, "day", windowStart("day", at));
    if (tDay.sent_count >= c.perTenantDaily) {
      return { allowed: false, reason: "tenant_daily" };
    }
    const pHour = await this.meter.read(PLATFORM, "hour", windowStart("hour", at));
    if (pHour.sent_count >= c.platformHourly) {
      return { allowed: false, reason: "platform_hourly" };
    }
    const pDay = await this.meter.read(PLATFORM, "day", windowStart("day", at));
    if (pDay.sent_count >= c.platformDaily) {
      return { allowed: false, reason: "platform_daily" };
    }
    if (concurrency.tenantSending >= c.perTenantConcurrent) {
      return { allowed: false, reason: "tenant_concurrent" };
    }
    if (concurrency.platformSending >= c.platformConcurrent) {
      return { allowed: false, reason: "platform_concurrent" };
    }
    return { allowed: true };
  }

  /**
   * Evaluate failure-rate auto-pause for a tenant over the current DAY window.
   * Uses only OBSERVABLE outcomes (failure + delivery_unknown over attempts) and
   * requires a minimum sample so a single failure can never pause a tenant.
   */
  async evaluateAutoPause(
    organizationId: string,
  ): Promise<
    | { pause: false }
    | { pause: true; reason: "failure_rate"; threshold: string }
  > {
    const at = this.now();
    const day = await this.meter.read(organizationId, "day", windowStart("day", at));
    const attempts = day.attempt_count;
    if (attempts < this.config.autoPauseMinSample) {
      return { pause: false };
    }
    const observedFailures = day.failure_count + day.unknown_count;
    const rate = observedFailures / attempts;
    if (rate >= this.config.autoPauseFailureRate) {
      return {
        pause: true,
        reason: "failure_rate",
        threshold: `${Math.round(this.config.autoPauseFailureRate * 100)}%_over_${attempts}`,
      };
    }
    return { pause: false };
  }
}
