import type {
  RequestHandler,
} from "express";

/**
 * A small in-memory fixed-window rate limiter.
 *
 * Keyed by an arbitrary string (typically client IP + account), it caps
 * attempts per window — enough to blunt credential brute-force and abuse of
 * unauthenticated endpoints. In-memory is correct for the single-process
 * deployment today; a multi-instance deployment would swap the store for a
 * shared one (Redis/Postgres) behind the same interface.
 */
export class RateLimiter {
  private readonly max: number;

  private readonly windowMs: number;

  private readonly now: () => number;

  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  private lastSweep = 0;

  constructor(options: {
    max: number;
    windowMs: number;
    now?: () => number;
  }) {
    this.max = options.max;
    this.windowMs =
      options.windowMs;
    this.now =
      options.now ??
      (() => Date.now());
  }

  /**
   * Records an attempt for `key` and reports whether it is allowed. When
   * blocked, `retryAfterMs` says how long until the window resets.
   */
  hit(key: string): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  } {
    const now = this.now();
    this.sweep(now);

    let bucket =
      this.buckets.get(key);

    if (
      !bucket ||
      now >= bucket.resetAt
    ) {
      bucket = {
        count: 0,
        resetAt: now + this.windowMs,
      };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;

    const allowed =
      bucket.count <= this.max;

    return {
      allowed,
      remaining: Math.max(
        0,
        this.max - bucket.count,
      ),
      retryAfterMs: allowed
        ? 0
        : bucket.resetAt - now,
    };
  }

  /** Clears a key (e.g. on a successful login). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Periodically drops expired buckets so the map can't grow unbounded. */
  private sweep(now: number): void {
    if (
      now - this.lastSweep <
      this.windowMs
    ) {
      return;
    }

    this.lastSweep = now;

    for (const [
      key,
      bucket,
    ] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Express middleware enforcing a {@link RateLimiter} keyed by client IP plus
 * an optional per-request discriminator (e.g. the target email/org), so both
 * spray (many accounts from one IP) and focused (one account) attacks are
 * bounded. Emits 429 with `Retry-After` when exceeded.
 */
export function rateLimit(options: {
  limiter: RateLimiter;
  scope: string;
  keyPart?: (
    req: Parameters<RequestHandler>[0],
  ) => string;
  message?: string;
}): RequestHandler {
  const {
    limiter,
    scope,
    keyPart,
    message = "Too many attempts. Please wait a moment and try again.",
  } = options;

  return (req, res, next) => {
    const ip =
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";
    const extra = keyPart
      ? keyPart(req)
      : "";
    const key = `${scope}:${ip}:${extra}`;

    const result = limiter.hit(key);

    if (!result.allowed) {
      res.setHeader(
        "Retry-After",
        String(
          Math.ceil(
            result.retryAfterMs /
              1000,
          ),
        ),
      );
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message,
        },
      });

      return;
    }

    next();
  };
}
