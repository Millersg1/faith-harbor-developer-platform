import { createHash, randomBytes } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * Account-email verification — proves a user controls their account email.
 * This is a SECURITY prerequisite (e.g. before the marketing test-email is
 * enabled). It is NOT marketing consent or double opt-in, and it NEVER enrolls
 * the user into marketing.
 */
function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * How many unexpired verification links may exist at once for the same
 * (user, normalized email). Small and bounded: a resend mints a fresh token
 * WITHOUT invalidating the prior (possibly-delivered) link — because SMTP
 * acceptance can be uncertain, invalidating the previous link before the new
 * one is known to have arrived could strand the user with no usable email. Once
 * ANY sibling confirms, all siblings are invalidated together.
 */
const MAX_ACTIVE_TOKENS = 3;

/**
 * The narrow account store the verifier needs. Implemented over the real user
 * repository (global by id, since confirmation has no tenant session), or a
 * stub in tests. `markVerified` sets evidence ONLY if the current account email
 * still matches the token's email.
 */
export interface UserVerificationStore {
  getEmail(userId: string): Promise<string | undefined>;
  isVerified(userId: string): Promise<boolean>;
  markVerified(
    userId: string,
    normalizedEmail: string,
    at: string,
  ): Promise<boolean>;
  clearVerification(userId: string): Promise<void>;
}

interface TokenRow {
  token_hash: string;
  user_id: string;
  email: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export class EmailVerificationTokenRepository {
  private readonly rows = new Map<string, Omit<TokenRow, "token_hash">>();

  constructor(private readonly db?: PgQueryable) {}

  async create(row: TokenRow): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO email_verification_tokens
           (token_hash, user_id, email, expires_at, consumed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.token_hash, row.user_id, row.email, row.expires_at, row.consumed_at, row.created_at],
      );
      return;
    }
    const { token_hash, ...rest } = row;
    this.rows.set(token_hash, rest);
  }

  async get(tokenHash: string): Promise<TokenRow | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM email_verification_tokens WHERE token_hash=$1",
        [tokenHash],
      );
      return (r.rows[0] as unknown as TokenRow) ?? undefined;
    }
    const rest = this.rows.get(tokenHash);
    return rest ? { token_hash: tokenHash, ...rest } : undefined;
  }

  async consume(tokenHash: string, at: string): Promise<boolean> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE email_verification_tokens SET consumed_at=$2
           WHERE token_hash=$1 AND consumed_at IS NULL`,
        [tokenHash, at],
      );
      return (r.rowCount ?? 0) > 0;
    }
    const rest = this.rows.get(tokenHash);
    if (!rest || rest.consumed_at) return false;
    rest.consumed_at = at;
    return true;
  }

  /**
   * Active (unconsumed, unexpired) tokens for a (user, normalized email),
   * oldest first. Ordering is deterministic — `created_at` then `token_hash`
   * as a stable tiebreaker — so "expire the oldest" is well-defined.
   */
  async listActive(
    userId: string,
    normalizedEmail: string,
    nowMs: number,
  ): Promise<Array<{ token_hash: string; created_at: string }>> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT token_hash, created_at FROM email_verification_tokens
           WHERE user_id=$1 AND email=$2 AND consumed_at IS NULL
             AND expires_at > $3
           ORDER BY created_at ASC, token_hash ASC`,
        [userId, normalizedEmail, new Date(nowMs).toISOString()],
      );
      return r.rows as unknown as Array<{
        token_hash: string;
        created_at: string;
      }>;
    }
    const out: Array<{ token_hash: string; created_at: string }> = [];
    for (const [hash, row] of this.rows) {
      if (
        row.user_id === userId &&
        row.email === normalizedEmail &&
        !row.consumed_at &&
        Date.parse(row.expires_at) > nowMs
      ) {
        out.push({ token_hash: hash, created_at: row.created_at });
      }
    }
    out.sort((a, b) =>
      a.created_at < b.created_at
        ? -1
        : a.created_at > b.created_at
          ? 1
          : a.token_hash < b.token_hash
            ? -1
            : 1,
    );
    return out;
  }

  /** Invalidate all unconsumed tokens for a user (sibling invalidation / email change). */
  async invalidateForUser(
    userId: string,
    at: string,
    exceptTokenHash?: string,
  ): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE email_verification_tokens SET consumed_at=$2
           WHERE user_id=$1 AND consumed_at IS NULL
             AND ($3::text IS NULL OR token_hash <> $3)`,
        [userId, at, exceptTokenHash ?? null],
      );
      return;
    }
    for (const [hash, row] of this.rows) {
      if (row.user_id === userId && !row.consumed_at && hash !== exceptTokenHash) {
        row.consumed_at = at;
      }
    }
  }
}

export type VerifyOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "already_used" };

export class EmailVerificationService {
  constructor(
    private readonly store: UserVerificationStore,
    private readonly tokens = new EmailVerificationTokenRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async isVerified(userId: string): Promise<boolean> {
    return this.store.isVerified(userId);
  }

  /**
   * Mint a verification token for the user's CURRENT account email (server-side
   * — the browser cannot choose a recipient). Returns the raw token ONCE for
   * the transactional email; only its hash is stored. A retry mints a new
   * independent token.
   */
  async request(userId: string): Promise<{ token: string; email: string } | null> {
    const email = await this.store.getEmail(userId);
    if (!email) return null;
    const normalized = normalizeEmail(email);
    const nowMs = this.now();
    const at = new Date(nowMs).toISOString();
    // Enforce a strict active-token cap for this (user, email). A resend mints a
    // NEW token bound to the SAME user/email without touching the others; only
    // if the cap would be exceeded do we expire the OLDEST tokens first
    // (deterministically), never the newest possibly-delivered link. The route
    // additionally rate-limits resends. Siblings are all invalidated together on
    // the first successful confirmation (see confirm) or on an email change.
    const active = await this.tokens.listActive(userId, normalized, nowMs);
    const excess = active.length - (MAX_ACTIVE_TOKENS - 1);
    for (let i = 0; i < excess; i += 1) {
      await this.tokens.consume(active[i].token_hash, at); // expire oldest-first
    }
    const raw = randomBytes(32).toString("hex");
    await this.tokens.create({
      token_hash: hashToken(raw),
      user_id: userId,
      email: normalized,
      expires_at: new Date(nowMs + TTL_MS).toISOString(),
      consumed_at: null,
      created_at: at,
    });
    return { token: raw, email: normalized };
  }

  /**
   * Confirm a token. Single-use + TTL; bound to (user, email) — a token is
   * invalid if the account email has since changed. On success, marks the
   * account verified and invalidates all sibling tokens. Fail-safe.
   */
  async confirm(rawToken: string): Promise<VerifyOutcome> {
    if (!rawToken) return { ok: false, reason: "invalid" };
    const row = await this.tokens.get(hashToken(rawToken));
    if (!row) return { ok: false, reason: "invalid" };
    if (row.consumed_at) return { ok: false, reason: "already_used" };
    if (Date.parse(row.expires_at) <= this.now()) {
      return { ok: false, reason: "expired" };
    }
    // Bound-email check: the account email must still match the token's email.
    const current = await this.store.getEmail(row.user_id);
    if (!current || normalizeEmail(current) !== row.email) {
      return { ok: false, reason: "invalid" };
    }
    const at = new Date(this.now()).toISOString();
    const consumed = await this.tokens.consume(row.token_hash, at);
    if (!consumed) return { ok: false, reason: "already_used" };
    const marked = await this.store.markVerified(row.user_id, row.email, at);
    if (!marked) return { ok: false, reason: "invalid" };
    await this.tokens.invalidateForUser(row.user_id, at, row.token_hash);
    return { ok: true, userId: row.user_id };
  }

  /**
   * Call when an account email changes: clear verification evidence and
   * invalidate all outstanding tokens so the NEW address must be verified.
   */
  async onEmailChanged(userId: string): Promise<void> {
    await this.store.clearVerification(userId);
    await this.tokens.invalidateForUser(userId, new Date(this.now()).toISOString());
  }
}
