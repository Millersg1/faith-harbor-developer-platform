/**
 * A small, dependency-free token-bucket rate limiter shared by the provider-sync
 * scanner (per-provider / per-tenant / platform call budgets) and, later, the
 * public-endpoint abuse controls. It is purely arithmetic — no timers, no I/O —
 * so it is deterministic under an injected clock and safe in tests.
 *
 * Each key gets its own bucket of `capacity` tokens that refills at
 * `refillPerSec`. `tryRemove` succeeds (and spends a token) only when one is
 * available; otherwise it fails and reports when the next token frees up. It
 * NEVER blocks — callers decide whether to defer/reschedule or reject.
 */

export interface RateDecision {
  allowed: boolean;
  /** Tokens left in the bucket after this call (floored at 0). */
  remaining: number;
  /** Ms until at least one token is available (0 when allowed). */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  lastMs: number;
}

export interface RateLimitRule {
  capacity: number;
  refillPerSec: number;
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  private refill(b: Bucket, atMs: number): void {
    if (atMs <= b.lastMs) return;
    const gained = ((atMs - b.lastMs) / 1000) * this.rule.refillPerSec;
    b.tokens = Math.min(this.rule.capacity, b.tokens + gained);
    b.lastMs = atMs;
  }

  /** Attempts to spend one token for `key`. */
  tryRemove(key: string, cost = 1): RateDecision {
    const atMs = this.nowMs();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.rule.capacity, lastMs: atMs };
      this.buckets.set(key, b);
    }
    this.refill(b, atMs);
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return { allowed: true, remaining: Math.floor(b.tokens), retryAfterMs: 0 };
    }
    const deficit = cost - b.tokens;
    const retryAfterMs = this.rule.refillPerSec > 0 ? Math.ceil((deficit / this.rule.refillPerSec) * 1000) : Number.POSITIVE_INFINITY;
    return { allowed: false, remaining: Math.max(0, Math.floor(b.tokens)), retryAfterMs };
  }

  /** Non-mutating peek at how many whole tokens `key` currently has. */
  peek(key: string): number {
    const b = this.buckets.get(key);
    if (!b) return this.rule.capacity;
    this.refill(b, this.nowMs());
    return Math.floor(b.tokens);
  }
}
