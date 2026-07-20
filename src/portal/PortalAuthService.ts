import { randomBytes } from "node:crypto";

interface PortalSession {
  clientId: string;
  expiresAt: number;
}

interface AttemptRecord {
  count: number;
  resetAt: number;
}

export interface PortalAuthOptions {
  sessionTtlMs?: number;
  maxAttempts?: number;
  attemptWindowMs?: number;
}

/**
 * Opaque server-side sessions for client-portal users.
 *
 * Each session is bound to exactly one clientId. Portal endpoints
 * derive the client from the session — never from the request — so a
 * signed-in client can only ever reach their own data.
 */
export class PortalAuthService {
  private readonly sessions =
    new Map<string, PortalSession>();

  private readonly attempts =
    new Map<string, AttemptRecord>();

  private readonly sessionTtlMs: number;
  private readonly maxAttempts: number;
  private readonly attemptWindowMs: number;

  constructor(
    options: PortalAuthOptions = {},
  ) {
    this.sessionTtlMs =
      options.sessionTtlMs ??
      12 * 60 * 60 * 1000;

    this.maxAttempts =
      options.maxAttempts ?? 5;

    this.attemptWindowMs =
      options.attemptWindowMs ??
      5 * 60 * 1000;
  }

  get sessionMaxAgeMs(): number {
    return this.sessionTtlMs;
  }

  /**
   * Creates a session bound to a client and returns its token.
   */
  createSession(
    clientId: string,
  ): string {
    const token = randomBytes(32)
      .toString("hex");

    this.sessions.set(token, {
      clientId,
      expiresAt:
        Date.now() +
        this.sessionTtlMs,
    });

    return token;
  }

  /**
   * Returns the clientId for a valid session, or undefined.
   */
  getClientId(
    token: string | undefined,
  ): string | undefined {
    if (!token) {
      return undefined;
    }

    const session =
      this.sessions.get(token);

    if (!session) {
      return undefined;
    }

    if (
      Date.now() > session.expiresAt
    ) {
      this.sessions.delete(token);
      return undefined;
    }

    return session.clientId;
  }

  destroySession(
    token: string | undefined,
  ): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  isLoginAllowed(
    key: string,
  ): boolean {
    const record =
      this.attempts.get(key);

    if (!record) {
      return true;
    }

    if (Date.now() > record.resetAt) {
      this.attempts.delete(key);
      return true;
    }

    return (
      record.count < this.maxAttempts
    );
  }

  recordFailedAttempt(
    key: string,
  ): void {
    const now = Date.now();
    const record =
      this.attempts.get(key);

    if (
      !record ||
      now > record.resetAt
    ) {
      this.attempts.set(key, {
        count: 1,
        resetAt:
          now + this.attemptWindowMs,
      });

      return;
    }

    record.count += 1;
  }

  clearAttempts(
    key: string,
  ): void {
    this.attempts.delete(key);
  }
}
