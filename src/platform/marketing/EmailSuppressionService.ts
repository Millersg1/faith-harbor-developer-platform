import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

/** Tenant unsubscribe reasons vs platform technical-suppression reasons. */
export type TenantSuppressionReason = "unsubscribe" | "manual";
export type GlobalSuppressionReason =
  | "hard_bounce"
  | "complaint"
  | "abuse"
  | "invalid_recipient"
  | "legal_block"
  | "safety";
export type SuppressionReason =
  | TenantSuppressionReason
  | GlobalSuppressionReason;

/**
 * Neutral deliverability result a tenant is allowed to see. When an address is
 * GLOBALLY suppressed the tenant learns only `suppressed` — never the reason,
 * timestamp, or which other tenant's activity caused it (no cross-tenant
 * disclosure). A tenant's OWN unsubscribe surfaces as `unsubscribed`.
 */
export interface Deliverability {
  eligible: boolean;
  reason?: "unsubscribed" | "suppressed";
}

function hashEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Stores email suppression. NOT tenant-scoped via AsyncLocalStorage — every
 * method takes an explicit organization id (or null for global), because
 * suppression is driven by no-login public routes (which carry a token, not a
 * session) and by platform technical events. In memory for tests; Postgres
 * otherwise.
 */
export class EmailSuppressionRepository {
  private readonly rows: {
    id: string;
    organizationId: string | null;
    email: string;
    scope: "tenant" | "global";
    reason: string;
    createdAt: string;
  }[] = [];

  constructor(private readonly db?: PgQueryable) {}

  async suppress(
    organizationId: string | null,
    email: string,
    reason: SuppressionReason,
    now: string,
  ): Promise<void> {
    const e = hashEmail(email);
    const scope = organizationId ? "tenant" : "global";
    if (this.db) {
      // Idempotent: the partial unique indexes make a repeat a no-op.
      await this.db.query(
        `INSERT INTO email_suppressions
           (id, organization_id, email, scope, reason, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [randomUUID(), organizationId, e, scope, reason, now],
      );
      return;
    }
    const exists = this.rows.some(
      (r) => r.organizationId === organizationId && r.email === e,
    );
    if (!exists) {
      this.rows.push({
        id: randomUUID(),
        organizationId,
        email: e,
        scope,
        reason,
        createdAt: now,
      });
    }
  }

  async isTenantSuppressed(
    organizationId: string,
    email: string,
  ): Promise<boolean> {
    const e = hashEmail(email);
    if (this.db) {
      const r = await this.db.query(
        `SELECT 1 FROM email_suppressions
           WHERE organization_id = $1 AND LOWER(email) = $2 LIMIT 1`,
        [organizationId, e],
      );
      return r.rows.length > 0;
    }
    return this.rows.some(
      (r) => r.organizationId === organizationId && r.email === e,
    );
  }

  async isGloballySuppressed(email: string): Promise<boolean> {
    const e = hashEmail(email);
    if (this.db) {
      const r = await this.db.query(
        `SELECT 1 FROM email_suppressions
           WHERE organization_id IS NULL AND LOWER(email) = $1 LIMIT 1`,
        [e],
      );
      return r.rows.length > 0;
    }
    return this.rows.some(
      (r) => r.organizationId === null && r.email === e,
    );
  }
}

/**
 * Tenant unsubscribe + platform global technical suppression. Enforces the
 * separation: a tenant unsubscribe never affects another tenant, and a global
 * suppression is never attributed to a tenant.
 */
export class EmailSuppressionService {
  constructor(
    private readonly repo = new EmailSuppressionRepository(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Tenant-scoped unsubscribe. Idempotent. */
  async suppressTenant(
    organizationId: string,
    email: string,
    reason: TenantSuppressionReason = "unsubscribe",
  ): Promise<void> {
    await this.repo.suppress(organizationId, email, reason, this.now());
  }

  /**
   * Platform-wide technical suppression (hard bounce / complaint / abuse /
   * invalid recipient / legal / safety). Applies across tenants; never
   * attributed to any tenant. Soft bounces must NOT be routed here.
   */
  async suppressGlobal(
    email: string,
    reason: GlobalSuppressionReason,
  ): Promise<void> {
    await this.repo.suppress(null, email, reason, this.now());
  }

  /**
   * Neutral, tenant-safe eligibility for a MARKETING send. Returns the least
   * information: own unsubscribe → `unsubscribed`; global suppression →
   * `suppressed` (no reason/timestamp/cross-tenant detail). Eligible otherwise.
   */
  async marketingDeliverability(
    organizationId: string,
    email: string,
  ): Promise<Deliverability> {
    if (await this.repo.isTenantSuppressed(organizationId, email)) {
      return { eligible: false, reason: "unsubscribed" };
    }
    if (await this.repo.isGloballySuppressed(email)) {
      return { eligible: false, reason: "suppressed" };
    }
    return { eligible: true };
  }

  /**
   * Eligibility for TRANSACTIONAL delivery (e.g. a requested lead magnet). A
   * tenant marketing unsubscribe does NOT block it; only a GLOBAL technical
   * suppression (undeliverable / safety) does.
   */
  async transactionalDeliverability(
    email: string,
  ): Promise<Deliverability> {
    if (await this.repo.isGloballySuppressed(email)) {
      return { eligible: false, reason: "suppressed" };
    }
    return { eligible: true };
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Stores unsubscribe tokens hash-only, mapping opaque token → (tenant, email). */
export class UnsubscribeTokenRepository {
  private readonly rows = new Map<
    string,
    { organizationId: string; email: string; revoked: boolean }
  >();

  constructor(private readonly db?: PgQueryable) {}

  async create(
    tokenHash: string,
    organizationId: string,
    email: string,
    now: string,
  ): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO unsubscribe_tokens
           (token_hash, organization_id, email, created_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT (token_hash) DO NOTHING`,
        [tokenHash, organizationId, hashEmail(email), now],
      );
      return;
    }
    this.rows.set(tokenHash, {
      organizationId,
      email: hashEmail(email),
      revoked: false,
    });
  }

  async resolve(
    tokenHash: string,
  ): Promise<{ organizationId: string; email: string } | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT organization_id, email FROM unsubscribe_tokens
           WHERE token_hash = $1 AND revoked = FALSE LIMIT 1`,
        [tokenHash],
      );
      const row = r.rows[0] as
        | { organization_id: string; email: string }
        | undefined;
      return row
        ? { organizationId: row.organization_id, email: row.email }
        : undefined;
    }
    const row = this.rows.get(tokenHash);
    return row && !row.revoked
      ? { organizationId: row.organizationId, email: row.email }
      : undefined;
  }
}

/**
 * Mints and resolves unsubscribe capability tokens. The raw token is returned
 * once (to embed in the email); only its hash is stored. A token is opaque,
 * single-purpose (unsubscribe only — it can never resubscribe or read data),
 * tenant+recipient scoped, revocable, and idempotent.
 */
export class UnsubscribeService {
  constructor(
    private readonly tokens = new UnsubscribeTokenRepository(),
    private readonly suppression = new EmailSuppressionService(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Mint a token for (org, email); returns the RAW token once. */
  async mint(organizationId: string, email: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    await this.tokens.create(hashToken(raw), organizationId, email, this.now());
    return raw;
  }

  /**
   * Consume an unsubscribe token → suppress that tenant's marketing to that
   * address. Idempotent and safe on repeat. Returns true if the token resolved
   * (so the caller can show a generic confirmation either way).
   */
  async unsubscribe(rawToken: string): Promise<boolean> {
    if (!rawToken) return false;
    const found = await this.tokens.resolve(hashToken(rawToken));
    if (!found) return false;
    await this.suppression.suppressTenant(
      found.organizationId,
      found.email,
      "unsubscribe",
    );
    return true;
  }
}
