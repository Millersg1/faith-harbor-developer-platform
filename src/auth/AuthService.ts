import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export interface AuthConfig {
  /**
   * The single administrator's email (login identity).
   */
  adminEmail: string;

  /**
   * Stored password hash in the form "scrypt$saltHex$hashHex".
   * Preferred over a plaintext password.
   */
  passwordHash?: string;

  /**
   * Plaintext password from the environment. Used only when no
   * hash is configured. Never logged or returned.
   */
  passwordPlain?: string;

  /**
   * Session lifetime in milliseconds. Defaults to 12 hours.
   */
  sessionTtlMs?: number;

  /**
   * Maximum failed login attempts per key before lockout.
   * Defaults to 5.
   */
  maxAttempts?: number;

  /**
   * Rate-limit window in milliseconds. Defaults to 5 minutes.
   */
  attemptWindowMs?: number;
}

interface AttemptRecord {
  count: number;
  resetAt: number;
}

/**
 * Creates a scrypt password hash suitable for ADMIN_PASSWORD_HASH.
 */
export function hashPassword(
  password: string,
): string {
  const salt = randomBytes(16);

  const derived = scryptSync(
    password,
    salt,
    64,
  );

  return `scrypt$${salt.toString(
    "hex",
  )}$${derived.toString("hex")}`;
}

function verifyHash(
  password: string,
  stored: string,
): boolean {
  const parts = stored.split("$");

  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt"
  ) {
    return false;
  }

  const salt = Buffer.from(
    parts[1],
    "hex",
  );

  const expected = Buffer.from(
    parts[2],
    "hex",
  );

  if (expected.length === 0) {
    return false;
  }

  const derived = scryptSync(
    password,
    salt,
    expected.length,
  );

  return timingSafeEqual(
    expected,
    derived,
  );
}

function safeStringEqual(
  a: string,
  b: string,
): boolean {
  const aHash = createHash("sha256")
    .update(a)
    .digest();

  const bHash = createHash("sha256")
    .update(b)
    .digest();

  return timingSafeEqual(aHash, bHash);
}

/**
 * Single-administrator authentication: credential verification,
 * opaque server-side sessions, and login rate limiting.
 */
export class AuthService {
  private readonly sessions =
    new Map<string, number>();

  private readonly attempts =
    new Map<string, AttemptRecord>();

  private readonly sessionTtlMs: number;
  private readonly maxAttempts: number;
  private readonly attemptWindowMs: number;

  constructor(
    private readonly config: AuthConfig,
  ) {
    this.sessionTtlMs =
      config.sessionTtlMs ??
      12 * 60 * 60 * 1000;

    this.maxAttempts =
      config.maxAttempts ?? 5;

    this.attemptWindowMs =
      config.attemptWindowMs ??
      5 * 60 * 1000;
  }

  /**
   * The administrator email, for display after login.
   */
  get adminEmail(): string {
    return this.config.adminEmail;
  }

  /**
   * Session lifetime in milliseconds (for the cookie max-age).
   */
  get sessionMaxAgeMs(): number {
    return this.sessionTtlMs;
  }

  /**
   * Verifies a login email and password.
   */
  verifyCredentials(
    email: string,
    password: string,
  ): boolean {
    const emailMatches =
      email.trim().toLowerCase() ===
      this.config.adminEmail
        .trim()
        .toLowerCase();

    if (!emailMatches) {
      return false;
    }

    if (this.config.passwordHash) {
      return verifyHash(
        password,
        this.config.passwordHash,
      );
    }

    if (this.config.passwordPlain) {
      return safeStringEqual(
        password,
        this.config.passwordPlain,
      );
    }

    return false;
  }

  /**
   * Creates a new session and returns its opaque token.
   */
  createSession(): string {
    const token = randomBytes(32)
      .toString("hex");

    this.sessions.set(
      token,
      Date.now() +
        this.sessionTtlMs,
    );

    return token;
  }

  /**
   * Determines whether a session token is valid and unexpired.
   */
  isValidSession(
    token: string | undefined,
  ): boolean {
    if (!token) {
      return false;
    }

    const expiresAt =
      this.sessions.get(token);

    if (expiresAt === undefined) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.sessions.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Ends a session.
   */
  destroySession(
    token: string | undefined,
  ): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  /**
   * Returns true when another login attempt is allowed for the key.
   */
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
      record.count <
      this.maxAttempts
    );
  }

  /**
   * Records a failed login attempt for rate limiting.
   */
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
          now +
          this.attemptWindowMs,
      });

      return;
    }

    record.count += 1;
  }

  /**
   * Clears the attempt counter after a successful login.
   */
  clearAttempts(
    key: string,
  ): void {
    this.attempts.delete(key);
  }
}
