import { createHash, randomBytes } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

const CONFIRM_TTL_MS = 72 * 60 * 60 * 1000; // 72h to confirm

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface TokenRow {
  token_hash: string;
  organization_id: string;
  email: string;
  consent_id: string | null;
  version: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

/** Stores double-opt-in confirmation tokens hash-only, single-use, time-limited. */
export class DoubleOptInTokenRepository {
  private readonly rows = new Map<string, Omit<TokenRow, "token_hash">>();

  constructor(private readonly db?: PgQueryable) {}

  async create(row: TokenRow): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO double_optin_tokens
           (token_hash, organization_id, email, consent_id, version,
            expires_at, consumed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          row.token_hash, row.organization_id, row.email.toLowerCase(),
          row.consent_id, row.version, row.expires_at, row.consumed_at,
          row.created_at,
        ],
      );
      return;
    }
    const { token_hash, ...rest } = row;
    this.rows.set(token_hash, rest);
  }

  async get(tokenHash: string): Promise<TokenRow | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM double_optin_tokens WHERE token_hash = $1 LIMIT 1",
        [tokenHash],
      );
      return (r.rows[0] as unknown as TokenRow) ?? undefined;
    }
    const rest = this.rows.get(tokenHash);
    return rest ? { token_hash: tokenHash, ...rest } : undefined;
  }

  /** Atomically mark consumed only if not already consumed. Returns success. */
  async consume(tokenHash: string, at: string): Promise<boolean> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE double_optin_tokens SET consumed_at = $2
           WHERE token_hash = $1 AND consumed_at IS NULL`,
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
   * Invalidate every OTHER unconsumed token for the same bound activation
   * (matched by consent_ref), once one has confirmed. Idempotent.
   */
  async invalidateSiblings(
    consentId: string,
    keepTokenHash: string,
    at: string,
  ): Promise<void> {
    if (!consentId) return;
    if (this.db) {
      await this.db.query(
        `UPDATE double_optin_tokens SET consumed_at = $3
           WHERE consent_id = $1 AND token_hash <> $2 AND consumed_at IS NULL`,
        [consentId, keepTokenHash, at],
      );
      return;
    }
    for (const [hash, row] of this.rows) {
      if (row.consent_id === consentId && hash !== keepTokenHash && !row.consumed_at) {
        row.consumed_at = at;
      }
    }
  }
}

export type ConfirmOutcome =
  | { ok: true; organizationId: string; email: string; consentId: string | null }
  | { ok: false; reason: "invalid" | "expired" | "already_used" };

/**
 * Double-opt-in confirmation. A token is random, single-use, time-limited, and
 * hash-only at rest, and is scoped to (tenant, email, consent version). The raw
 * token is returned once (to email as a fragment link). Confirming records
 * immutable consent evidence via the injected `confirmConsent` callback (run in
 * the token's tenant scope by the caller). Email verification confirms control
 * of the address — it is NOT full identity verification.
 */
export class DoubleOptInService {
  constructor(
    private readonly tokens = new DoubleOptInTokenRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async mint(input: {
    organizationId: string;
    email: string;
    consentId?: string | null;
    version?: string | null;
  }): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const nowMs = this.now();
    await this.tokens.create({
      token_hash: hashToken(raw),
      organization_id: input.organizationId,
      email: input.email.trim().toLowerCase(),
      consent_id: input.consentId ?? null,
      version: input.version ?? null,
      expires_at: new Date(nowMs + CONFIRM_TTL_MS).toISOString(),
      consumed_at: null,
      created_at: new Date(nowMs).toISOString(),
    });
    return raw;
  }

  /**
   * Resolve + consume a confirmation token. Fails safely (never throws) on
   * invalid / expired / already-used / forged / cross-tenant tokens. On success
   * returns the (tenant, email) so the caller can, in that tenant's scope,
   * record confirmed consent and (S7) enroll into marketing.
   */
  async confirm(rawToken: string): Promise<ConfirmOutcome> {
    if (!rawToken) return { ok: false, reason: "invalid" };
    const row = await this.tokens.get(hashToken(rawToken));
    if (!row) return { ok: false, reason: "invalid" };
    if (row.consumed_at) return { ok: false, reason: "already_used" };
    if (Date.parse(row.expires_at) <= this.now()) {
      return { ok: false, reason: "expired" };
    }
    const at = new Date(this.now()).toISOString();
    const consumed = await this.tokens.consume(row.token_hash, at);
    if (!consumed) return { ok: false, reason: "already_used" }; // race
    // One token confirmed the activation → invalidate all sibling tokens so a
    // replacement/retry token can't confirm a second time. Idempotent.
    if (row.consent_id) {
      await this.tokens.invalidateSiblings(row.consent_id, row.token_hash, at);
    }
    return {
      ok: true,
      organizationId: row.organization_id,
      email: row.email,
      consentId: row.consent_id,
    };
  }
}
